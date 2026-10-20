import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({
  refresh: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("next/cache", () => ({ refresh: next.refresh }));
vi.mock("next/navigation", () => ({ redirect: next.redirect }));

type Answer = { data?: unknown; count?: number | null; error: { message: string; code: string } | null };

/** Table and RPC calls made as the signed-in user, and what each one answers in turn. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answers: [] as Answer[],
  userId: "client-1" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const answer = () => db.answers.shift() ?? { data: null, error: null };
    const query = (table: string) => {
      const steps: unknown[] = [table];
      db.calls.push(steps);
      const chain = { then: (resolve: (value: Answer) => unknown) => resolve(answer()) } as Record<string, unknown>;
      for (const step of ["insert", "update", "select", "eq"]) {
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
        return Promise.resolve(answer());
      },
    };
  },
}));

const { decideIntakeShare, markIntakeSeen, remindIntake, setIntakeShare, submitIntake } = await import("./actions");

const PAIR = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-10-18T09:00:00.000Z";
const IDLE = { status: "idle" } as const;
const broken = { data: null, error: { code: "XX000", message: "internal detail" } };

function intakeForm(over: Record<string, string> = {}, goals = ["strength"]) {
  const form = new FormData();
  for (const goal of goals) form.append("goals", goal);
  const fields = { goal_note: "", health: "", injuries: " колено ", contraindications: "", medications: "", q1: "no", q2: "no", q3: "no", q4: "no", q5: "no", q6: "no", q7: "no", ...over };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date(NOW), toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(db, { calls: [], answers: [], userId: "client-1" });
});

describe("submitIntake", () => {
  it("saves a new version as the signed-in client and refreshes", async () => {
    expect(await submitIntake(IDLE, intakeForm())).toEqual({ status: "sent", flagged: false });
    expect(db.calls).toEqual([
      [
        "intakes",
        "insert",
        {
          user_id: "client-1",
          form_version: "v1",
          answers: { goals: ["strength"], goal_note: null, health: null, injuries: "колено", contraindications: null, medications: null },
          parq_answers: { q1: false, q2: false, q3: false, q4: false, q5: false, q6: false, q7: false },
        },
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("flags the intake when any PAR-Q answer is yes", async () => {
    expect(await submitIntake(IDLE, intakeForm({ q4: "yes" }))).toEqual({ status: "sent", flagged: true });
  });

  it("names the missing fields, keeps what was typed and writes nothing", async () => {
    const state = await submitIntake(IDLE, intakeForm({ q2: "" }, []));
    expect(state).toMatchObject({ status: "invalid", fields: ["q2", "goals"] });
    expect(state.status === "invalid" && state.values.injuries).toBe(" колено ");
    expect(db.calls).toEqual([]);
  });

  it("refuses a text over 2000 characters and an unknown goal", async () => {
    expect(await submitIntake(IDLE, intakeForm({ health: "a".repeat(2001) }))).toMatchObject({ status: "invalid", fields: ["health"] });
    expect(await submitIntake(IDLE, intakeForm({}, ["fly"]))).toMatchObject({ status: "invalid", fields: ["goals"] });
    expect(db.calls).toEqual([]);
  });

  it("writes nothing when signed out", async () => {
    db.userId = null;
    expect(await submitIntake(IDLE, intakeForm())).toMatchObject({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("fails on a database error and keeps the values", async () => {
    db.answers = [broken];
    const state = await submitIntake(IDLE, intakeForm());
    expect(state).toMatchObject({ status: "failed", values: { goals: ["strength"] } });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("decideIntakeShare", () => {
  it("stamps the decision and goes on to the intake while the client has none", async () => {
    db.answers = [{ data: [{ coaching_id: PAIR }], error: null }, { count: 0, error: null }];
    await expect(decideIntakeShare(PAIR, true)).rejects.toThrow(`NEXT_REDIRECT /client/trainers/${PAIR}/intake`);
    expect(db.calls).toEqual([
      ["data_shares", "update", { intake: true, intake_decided_at: NOW }, "eq", "coaching_id", PAIR, "select", "coaching_id"],
      ["intakes", "select", "id", { count: "exact", head: true }, "eq", "user_id", "client-1"],
    ]);
  });

  it("goes back to the pair when the client already has an intake", async () => {
    db.answers = [{ data: [{ coaching_id: PAIR }], error: null }, { count: 2, error: null }];
    await expect(decideIntakeShare(PAIR, false)).rejects.toThrow(`NEXT_REDIRECT /client/trainers/${PAIR}`);
    expect(next.redirect).toHaveBeenCalledWith(`/client/trainers/${PAIR}`);
    expect(db.calls[0][2]).toEqual({ intake: false, intake_decided_at: NOW });
  });

  it.each([
    ["a malformed pair", ["p", true]],
    ["a choice that is not a boolean", [PAIR, "yes"]],
  ])("refuses %s without a query", async (_label, args) => {
    expect(await decideIntakeShare(...(args as [string, boolean]))).toEqual({ failed: true });
    expect(db.calls).toEqual([]);
    expect(next.redirect).not.toHaveBeenCalled();
  });

  it("stays put when nothing was updated (not the client's pair) or the update failed", async () => {
    db.answers = [{ data: [], error: null }];
    expect(await decideIntakeShare(PAIR, true)).toEqual({ failed: true });
    db.answers = [broken];
    expect(await decideIntakeShare(PAIR, true)).toEqual({ failed: true });
    expect(next.redirect).not.toHaveBeenCalled();
  });
});

describe("setIntakeShare", () => {
  it.each([true, false])("switches the intake share to %s and refreshes", async (show) => {
    db.answers = [{ data: [{ coaching_id: PAIR }], error: null }];
    expect(await setIntakeShare(PAIR, show)).toEqual({ failed: false });
    expect(db.calls).toEqual([["data_shares", "update", { intake: show, intake_decided_at: NOW }, "eq", "coaching_id", PAIR, "select", "coaching_id"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses malformed input without a query", async () => {
    expect(await setIntakeShare("p", true)).toEqual({ failed: true });
    expect(await setIntakeShare(PAIR, 1 as unknown as boolean)).toEqual({ failed: true });
    expect(db.calls).toEqual([]);
  });

  it("fails without refreshing when nothing was updated or on an error", async () => {
    db.answers = [{ data: [], error: null }, broken];
    expect(await setIntakeShare(PAIR, true)).toEqual({ failed: true });
    expect(await setIntakeShare(PAIR, true)).toEqual({ failed: true });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("remindIntake", () => {
  it("sends a reminder through remind_intake", async () => {
    db.answers = [{ data: true, error: null }];
    expect(await remindIntake(PAIR)).toEqual({ status: "sent" });
    expect(db.calls).toEqual([["rpc", "remind_intake", { p_coaching_id: PAIR }]]);
  });

  it("says a reminder already went today", async () => {
    db.answers = [{ data: false, error: null }];
    expect(await remindIntake(PAIR)).toEqual({ status: "already" });
  });

  it("refuses a malformed pair without a call", async () => {
    expect(await remindIntake("p")).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    ["intake_filled", "filled"],
    ["intake_hidden", "hidden"],
    ["not_trainer", "failed"],
  ])("maps %s to %s", async (message, status) => {
    db.answers = [{ data: null, error: { code: "P0001", message } }];
    expect(await remindIntake(PAIR)).toEqual({ status });
  });
});

describe("markIntakeSeen", () => {
  it("stamps intake_seen_at on the trainer's side of the pair", async () => {
    await markIntakeSeen(PAIR);
    expect(db.calls).toEqual([["coaching_trainer_meta", "update", { intake_seen_at: NOW }, "eq", "coaching_id", PAIR]]);
  });

  it("does nothing for a malformed pair and only logs an error", async () => {
    await markIntakeSeen("p");
    expect(db.calls).toEqual([]);
    db.answers = [broken];
    await expect(markIntakeSeen(PAIR)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("marking the intake as seen failed", "XX000");
  });
});
