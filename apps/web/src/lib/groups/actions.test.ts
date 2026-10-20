import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** Table and RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
  userId: "trainer-1" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const query = (table: string) => {
      const steps: unknown[] = [table];
      db.calls.push(steps);
      const chain = { then: (resolve: (value: Answer) => unknown) => resolve(db.answer) } as Record<string, unknown>;
      for (const step of ["insert", "update", "delete", "select", "eq", "single"]) {
        chain[step] = (...args: unknown[]) => {
          steps.push(step, ...args);
          return chain;
        };
      }
      return chain;
    };
    return {
      auth: { getClaims: async () => ({ data: db.userId ? { claims: { sub: db.userId } } : null }) },
      from: query,
      rpc: (fn: string, args: unknown) => {
        db.calls.push(["rpc", fn, args]);
        return Promise.resolve(db.answer);
      },
    };
  },
}));

const {
  addGroupMember,
  archiveGroup,
  clearGroupTarget,
  createGroup,
  deleteBroadcast,
  makePrimaryGroup,
  removeGroupMember,
  sendBroadcast,
  setBroadcastsMuted,
  setGroupTarget,
  updateGroup,
} = await import("./actions");

const GROUP = "00000000-0000-4000-8000-000000000001";
const PAIR = "00000000-0000-4000-8000-000000000002";
const BROADCAST = "00000000-0000-4000-8000-000000000003";
const NOW = "2026-10-18T09:00:00.000Z";

const plan = { data: null, error: { code: "42501", message: "plan_required" } };
const broken = { data: null, error: { code: "XX000", message: "internal detail" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answer: { data: null, error: null }, userId: "trainer-1" });
});

const group = { name: "  Утренняя группа  ", goal: "lose", description: "  Похудение к лету ", color: "#16A34A" };

describe("createGroup", () => {
  it("creates the group for the signed-in trainer with trimmed texts and returns its id", async () => {
    db.answer = { data: { id: GROUP }, error: null };
    expect(await createGroup(group)).toEqual({ ok: true, value: GROUP });
    expect(db.calls).toEqual([
      [
        "groups",
        "insert",
        { trainer_id: "trainer-1", name: "Утренняя группа", goal: "lose", description: "Похудение к лету", color: "#16A34A" },
        "select",
        "id",
        "single",
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes an empty group: no goal, colour or description", async () => {
    db.answer = { data: { id: GROUP }, error: null };
    await createGroup({ name: "Г", goal: null, description: "   ", color: null });
    expect(db.calls[0][2]).toEqual({ trainer_id: "trainer-1", name: "Г", goal: null, description: null, color: null });
  });

  it("takes a 60-character name and a 500-character description", async () => {
    db.answer = { data: { id: GROUP }, error: null };
    expect(await createGroup({ ...group, name: "a".repeat(60), description: "b".repeat(500) })).toMatchObject({ ok: true });
  });

  it.each([
    ["a blank name", { name: "   " }],
    ["a 61-character name", { name: "a".repeat(61) }],
    ["a 501-character description", { description: "b".repeat(501) }],
    ["an unknown goal", { goal: "bulk" }],
    ["a colour off the palette", { color: "#000000" }],
    ["a name that is not text", { name: 42 as unknown as string }],
  ])("refuses %s without a query", async (_label, over) => {
    expect(await createGroup({ ...group, ...over })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("writes nothing when signed out", async () => {
    db.userId = null;
    expect(await createGroup(group)).toEqual({ ok: false, reason: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("reads any policy refusal as a plan without groups", async () => {
    db.answer = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    expect(await createGroup(group)).toEqual({ ok: false, reason: "plan" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("fails on other errors", async () => {
    db.answer = broken;
    expect(await createGroup(group)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("updateGroup", () => {
  it("updates the group by id and refreshes", async () => {
    expect(await updateGroup(GROUP, group)).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["groups", "update", { name: "Утренняя группа", goal: "lose", description: "Похудение к лету", color: "#16A34A" }, "eq", "id", GROUP],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id or bad fields without a query", async () => {
    expect(await updateGroup("1", group)).toEqual({ ok: false, reason: "invalid" });
    expect(await updateGroup(GROUP, { ...group, name: "" })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps plan_required to plan and anything else to failed", async () => {
    db.answer = plan;
    expect(await updateGroup(GROUP, group)).toEqual({ ok: false, reason: "plan" });
    db.answer = { data: null, error: { code: "42501", message: "other" } };
    expect(await updateGroup(GROUP, group)).toEqual({ ok: false, reason: "failed" });
    db.answer = broken;
    expect(await updateGroup(GROUP, group)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("archiveGroup", () => {
  it("stamps archived_at instead of deleting", async () => {
    expect(await archiveGroup(GROUP)).toEqual({ ok: true });
    expect(db.calls).toEqual([["groups", "update", { archived_at: NOW }, "eq", "id", GROUP]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id", async () => {
    expect(await archiveGroup(null)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps errors", async () => {
    db.answer = plan;
    expect(await archiveGroup(GROUP)).toEqual({ ok: false, reason: "plan" });
    db.answer = broken;
    expect(await archiveGroup(GROUP)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("addGroupMember", () => {
  it("adds through add_group_member and returns the goal warning", async () => {
    db.answer = { data: true, error: null };
    expect(await addGroupMember(GROUP, PAIR, true)).toEqual({ ok: true, value: true });
    expect(db.calls).toEqual([["rpc", "add_group_member", { p_group_id: GROUP, p_coaching_id: PAIR, p_make_primary: true }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("leaves the primary choice to the database when it is not given", async () => {
    db.answer = { data: false, error: null };
    expect(await addGroupMember(GROUP, PAIR)).toEqual({ ok: true, value: false });
    expect(db.calls[0][2]).toEqual({ p_group_id: GROUP, p_coaching_id: PAIR, p_make_primary: undefined });
  });

  it("reads anything but true as no warning", async () => {
    db.answer = { data: null, error: null };
    expect(await addGroupMember(GROUP, PAIR)).toEqual({ ok: true, value: false });
  });

  it.each([
    ["a malformed group", ["g", PAIR, undefined]],
    ["a malformed pair", [GROUP, "p", undefined]],
    ["a primary flag that is not a boolean", [GROUP, PAIR, "yes"]],
  ])("refuses %s", async (_label, args) => {
    expect(await addGroupMember(...(args as [unknown, unknown, boolean]))).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("asks which group is primary, and maps plan and other errors", async () => {
    db.answer = { data: null, error: { code: "P0001", message: "primary_choice_required" } };
    expect(await addGroupMember(GROUP, PAIR)).toEqual({ ok: false, reason: "primary" });
    db.answer = plan;
    expect(await addGroupMember(GROUP, PAIR)).toEqual({ ok: false, reason: "plan" });
    db.answer = broken;
    expect(await addGroupMember(GROUP, PAIR)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("removeGroupMember", () => {
  it("deletes the membership row of this group and pair", async () => {
    expect(await removeGroupMember(GROUP, PAIR)).toEqual({ ok: true });
    expect(db.calls).toEqual([["group_members", "delete", "eq", "group_id", GROUP, "eq", "coaching_id", PAIR]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses malformed ids", async () => {
    expect(await removeGroupMember(GROUP, "x")).toEqual({ ok: false, reason: "invalid" });
    expect(await removeGroupMember("x", PAIR)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps errors", async () => {
    db.answer = broken;
    expect(await removeGroupMember(GROUP, PAIR)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("makePrimaryGroup", () => {
  it("calls set_primary_nutrition_group", async () => {
    expect(await makePrimaryGroup(GROUP, PAIR)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_primary_nutrition_group", { p_coaching_id: PAIR, p_group_id: GROUP }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses malformed ids", async () => {
    expect(await makePrimaryGroup(1, PAIR)).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps errors", async () => {
    db.answer = plan;
    expect(await makePrimaryGroup(GROUP, PAIR)).toEqual({ ok: false, reason: "plan" });
    db.answer = broken;
    expect(await makePrimaryGroup(GROUP, PAIR)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("setGroupTarget", () => {
  const target = { groupId: GROUP, kcal: 1800, proteinG: 120, fatG: 60, carbsG: 200, waterMl: 2500, steps: 9000, confirmLow: false };

  it("sends every value to set_group_target", async () => {
    expect(await setGroupTarget(target)).toEqual({ ok: true });
    expect(db.calls).toEqual([
      [
        "rpc",
        "set_group_target",
        {
          p_group_id: GROUP,
          p_kcal: 1800,
          p_protein_g: 120,
          p_fat_g: 60,
          p_carbs_g: 200,
          p_water_ml: 2500,
          p_steps_target: 9000,
          p_confirm_low: false,
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("leaves empty values out so the database keeps its defaults", async () => {
    await setGroupTarget({ ...target, proteinG: null, fatG: null, carbsG: null, waterMl: null, steps: null });
    expect(db.calls[0][2]).toEqual({
      p_group_id: GROUP,
      p_kcal: 1800,
      p_protein_g: undefined,
      p_fat_g: undefined,
      p_carbs_g: undefined,
      p_water_ml: undefined,
      p_steps_target: undefined,
      p_confirm_low: false,
    });
  });

  it("takes the edges of every range", async () => {
    expect(await setGroupTarget({ ...target, kcal: 500, proteinG: 0, fatG: 1000, carbsG: 2000, waterMl: 10000, steps: 100000 })).toEqual({ ok: true });
    expect(await setGroupTarget({ ...target, kcal: 10000 })).toEqual({ ok: true });
  });

  it.each([
    ["kcal under 500", { kcal: 499 }],
    ["kcal over 10000", { kcal: 10001 }],
    ["fractional kcal", { kcal: 1800.5 }],
    ["negative protein", { proteinG: -1 }],
    ["protein over 1000", { proteinG: 1001 }],
    ["fat over 1000", { fatG: 1001 }],
    ["carbs over 2000", { carbsG: 2001 }],
    ["water over 10000", { waterMl: 10001 }],
    ["steps over 100000", { steps: 100001 }],
    ["fractional grams", { fatG: 1.5 }],
    ["a missing confirmation flag", { confirmLow: undefined as unknown as boolean }],
    ["a malformed group", { groupId: "group-1" }],
  ])("refuses %s without a call", async (_label, over) => {
    expect(await setGroupTarget({ ...target, ...over })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("asks to confirm a low target, and maps plan and other errors", async () => {
    db.answer = { data: null, error: { code: "P0001", message: "low_kcal_unconfirmed" } };
    expect(await setGroupTarget({ ...target, kcal: 1100 })).toEqual({ ok: false, reason: "low" });
    db.answer = plan;
    expect(await setGroupTarget(target)).toEqual({ ok: false, reason: "plan" });
    db.answer = broken;
    expect(await setGroupTarget(target)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("clearGroupTarget", () => {
  it("calls clear_group_target", async () => {
    expect(await clearGroupTarget(GROUP)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "clear_group_target", { p_group_id: GROUP }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id and maps errors", async () => {
    expect(await clearGroupTarget("x")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
    db.answer = plan;
    expect(await clearGroupTarget(GROUP)).toEqual({ ok: false, reason: "plan" });
    db.answer = broken;
    expect(await clearGroupTarget(GROUP)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("sendBroadcast", () => {
  it("sends a trimmed text without a button", async () => {
    expect(await sendBroadcast(GROUP, "  Завтра тренировка в 9  ", { kind: "none" })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["rpc", "send_broadcast", { p_group_id: GROUP, p_body: "Завтра тренировка в 9", p_button_kind: undefined, p_button_url: undefined }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends a deep link button without a url", async () => {
    await sendBroadcast(GROUP, "Привет", { kind: "deep_link" });
    expect(db.calls[0][2]).toMatchObject({ p_button_kind: "deep_link", p_button_url: undefined });
  });

  it("sends a link button with its trimmed https address", async () => {
    await sendBroadcast(GROUP, "Привет", { kind: "url", url: "  https://example.com/plan  " });
    expect(db.calls[0][2]).toMatchObject({ p_button_kind: "url", p_button_url: "https://example.com/plan" });
  });

  it("takes a text of exactly 2000 characters", async () => {
    expect(await sendBroadcast(GROUP, "a".repeat(2000), { kind: "none" })).toEqual({ ok: true });
  });

  it.each([
    ["a malformed group", ["g", "Привет", { kind: "none" }]],
    ["a body that is not text", [GROUP, 5, { kind: "none" }]],
    ["a blank body", [GROUP, "   ", { kind: "none" }]],
    ["a body over 2000 characters", [GROUP, "a".repeat(2001), { kind: "none" }]],
    ["no button", [GROUP, "Привет", null]],
    ["an unknown button kind", [GROUP, "Привет", { kind: "call" }]],
    ["an http link", [GROUP, "Привет", { kind: "url", url: "http://example.com" }]],
    ["a javascript link", [GROUP, "Привет", { kind: "url", url: "javascript:alert(1)" }]],
    ["a link with a space", [GROUP, "Привет", { kind: "url", url: "https://example.com/a b" }]],
    ["a link over 500 characters", [GROUP, "Привет", { kind: "url", url: `https://example.com/${"a".repeat(490)}` }]],
  ])("refuses %s without a call", async (_label, args) => {
    expect(await sendBroadcast(...(args as Parameters<typeof sendBroadcast>))).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["broadcast_limit", "limit"],
    ["group_empty", "empty"],
    ["plan_required", "plan"],
    ["something else", "failed"],
  ])("maps %s to %s", async (message, reason) => {
    db.answer = { data: null, error: { code: message === "plan_required" ? "42501" : "P0001", message } };
    expect(await sendBroadcast(GROUP, "Привет", { kind: "none" })).toEqual({ ok: false, reason });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("deleteBroadcast", () => {
  it("hides the broadcast from the history by stamping deleted_at", async () => {
    expect(await deleteBroadcast(BROADCAST)).toEqual({ ok: true });
    expect(db.calls).toEqual([["broadcasts", "update", { deleted_at: NOW }, "eq", "id", BROADCAST]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id and maps errors", async () => {
    expect(await deleteBroadcast("b")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
    db.answer = broken;
    expect(await deleteBroadcast(BROADCAST)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("setBroadcastsMuted", () => {
  it.each([true, false])("sets muted to %s through set_broadcasts_muted", async (muted) => {
    expect(await setBroadcastsMuted(PAIR, muted)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_broadcasts_muted", { p_coaching_id: PAIR, p_muted: muted }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a malformed pair or a flag that is not a boolean", async () => {
    expect(await setBroadcastsMuted("p", true)).toEqual({ ok: false, reason: "invalid" });
    expect(await setBroadcastsMuted(PAIR, "true")).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("maps errors", async () => {
    db.answer = broken;
    expect(await setBroadcastsMuted(PAIR, true)).toEqual({ ok: false, reason: "failed" });
  });
});
