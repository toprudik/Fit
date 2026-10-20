import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in trainer (with .single() when the action asks for one row), and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      const call: unknown[] = ["rpc", fn, args];
      db.calls.push(call);
      return Object.assign(Promise.resolve(db.answer), {
        single: () => {
          call.push("single");
          return Promise.resolve(db.answer);
        },
      });
    },
  }),
}));

const actions = await import("./actions");
const { answerInvite, createAssistant, createSubstitute, createSubstitutes, inviteDelegate, markDelegatedAttendance, revokeDelegation, searchDelegates, setAssistantProgress } =
  actions;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SESSION = id(1);
const DELEGATION = id(2);
const TRAINER = id(3);
const PAIR = id(4);
const TOKEN = "Ab3_-Ab3_-Ab3_-Ab3_-Ab";
const INVITE = { delegation_id: DELEGATION, token: TOKEN };
const LINK = `https://fit.example/trainer/team/accept?token=${TOKEN}`;
const INVALID = { ok: false, reason: "invalid" };
const fail = (message: string, code = "P0001") => ({ data: null, error: { message, code } });

/** Each database message the screens explain, and the reason it becomes. */
const MAPPED: [string, string][] = [
  ["plan_required", "plan"],
  ["already_delegated", "taken"],
  ["not_verified", "not_verified"],
  ["own_delegation", "own"],
  ["invite_expired", "expired"],
  ["not_pending", "expired"],
  ["invite_not_found", "not_found"],
  ["trainer_not_found", "not_found"],
  ["session_not_found", "not_found"],
  ["pair_not_found", "not_found"],
];

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  { name: "createSubstitute", run: () => actions.createSubstitute(SESSION) },
  { name: "revokeDelegation", run: () => actions.revokeDelegation(DELEGATION) },
  { name: "searchDelegates", run: () => actions.searchDelegates("Анна") },
  { name: "inviteDelegate", run: () => actions.inviteDelegate(DELEGATION, TRAINER) },
  { name: "answerInvite", run: () => actions.answerInvite(TOKEN, true) },
  { name: "setAssistantProgress", run: () => actions.setAssistantProgress(PAIR, true) },
  { name: "markDelegatedAttendance", run: () => actions.markDelegatedAttendance(id(5), "attended") },
])("$name: error mapping", ({ run }) => {
  it("maps each known database message to its reason without a refresh", async () => {
    for (const [message, reason] of MAPPED) {
      db.answer = fail(message);
      expect(await run()).toEqual({ ok: false, reason });
    }
    expect(logged).not.toHaveBeenCalled();
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("hides an unknown error behind failed and logs only its code", async () => {
    db.answer = fail("permission denied for table delegations", "42501");
    expect(await run()).toEqual({ ok: false, reason: "failed" });
    expect(logged).toHaveBeenCalledWith(expect.stringMatching(/failed$/), "42501");
  });
});

describe("createSubstitute", () => {
  it("creates a one-time invite for the session and returns its link", async () => {
    db.answer = { data: INVITE, error: null };
    expect(await createSubstitute(SESSION)).toEqual({ ok: true, value: { id: DELEGATION, link: LINK } });
    expect(db.calls).toEqual([["rpc", "create_delegation", { p_kind: "substitute", p_session_id: SESSION }, "single"]]);
    // No refresh here: it would re-render the session card and close the sheet that shows the link. The sheet refreshes on close.
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refuses a bad session id without a call", async () => {
    expect(await createSubstitute("nope")).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });
});

describe("createSubstitutes", () => {
  it("creates one invite for several sessions, without duplicates or bad ids", async () => {
    db.answer = { data: INVITE, error: null };
    expect(await createSubstitutes([SESSION, id(6), SESSION, "nope"])).toEqual({ ok: true, value: { id: DELEGATION, link: LINK } });
    expect(db.calls).toEqual([["rpc", "create_substitutions", { p_session_ids: [SESSION, id(6)] }, "single"]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("uses the single-session invite when one session is left", async () => {
    db.answer = { data: INVITE, error: null };
    await createSubstitutes([SESSION, SESSION]);
    expect(db.calls).toEqual([["rpc", "create_delegation", { p_kind: "substitute", p_session_id: SESSION }, "single"]]);
  });

  it("takes 20 sessions and refuses none, 21 or a non-array without a call", async () => {
    db.answer = { data: INVITE, error: null };
    const twenty = Array.from({ length: 20 }, (_, n) => id(100 + n));
    expect(await createSubstitutes(twenty)).toMatchObject({ ok: true });
    db.calls = [];
    expect(await createSubstitutes([])).toEqual(INVALID);
    expect(await createSubstitutes(["nope"])).toEqual(INVALID);
    expect(await createSubstitutes([...twenty, id(200)])).toEqual(INVALID);
    expect(await createSubstitutes("x" as unknown as string[])).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });

  it("reads 22023 as invalid and maps the rest", async () => {
    db.answer = fail("sessions_not_future", "22023");
    expect(await createSubstitutes([SESSION, id(6)])).toEqual(INVALID);
    db.answer = fail("plan_required");
    expect(await createSubstitutes([SESSION, id(6)])).toEqual({ ok: false, reason: "plan" });
    db.answer = fail("boom", "XX000");
    expect(await createSubstitutes([SESSION, id(6)])).toEqual({ ok: false, reason: "failed" });
  });
});

describe("createAssistant", () => {
  const input = { scopes: ["schedule", "notes", "schedule"], allClients: false, coachingIds: [PAIR, PAIR, "nope"], endsOn: "2026-12-31" };

  it("creates the invite for the chosen scopes and clients, ending at the end of the day", async () => {
    db.answer = { data: INVITE, error: null };
    expect(await createAssistant(input)).toEqual({ ok: true, value: { id: DELEGATION, link: LINK } });
    expect(db.calls).toEqual([
      [
        "rpc",
        "create_delegation",
        { p_kind: "assistant", p_scopes: ["schedule", "notes"], p_all_clients: false, p_coaching_ids: [PAIR], p_ends_at: "2026-12-31T23:59:59Z" },
        "single",
      ],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("sends no client list for all clients and no end for an open-ended or malformed date", async () => {
    db.answer = { data: INVITE, error: null };
    await createAssistant({ scopes: ["attendance"], allClients: true, coachingIds: [PAIR], endsOn: null });
    await createAssistant({ scopes: ["attendance"], allClients: true, coachingIds: [], endsOn: "31.12.2026" });
    for (const call of db.calls) {
      expect(call[2]).toEqual({ p_kind: "assistant", p_scopes: ["attendance"], p_all_clients: true, p_coaching_ids: undefined, p_ends_at: undefined });
    }
  });

  it("drops unknown scopes and refuses no scope or no client without a call", async () => {
    expect(await createAssistant({ ...input, scopes: ["admin", "billing"] })).toEqual(INVALID);
    expect(await createAssistant({ ...input, scopes: [] })).toEqual(INVALID);
    expect(await createAssistant({ ...input, coachingIds: ["nope"] })).toEqual(INVALID);
    expect(await createAssistant({ ...input, allClients: "yes" as unknown as boolean, coachingIds: [] })).toEqual(INVALID);
    expect(await createAssistant({ ...input, scopes: "schedule" as unknown as string[] })).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });

  it("reads 22023 as invalid and maps the rest", async () => {
    db.answer = fail("ends_in_past", "22023");
    expect(await createAssistant(input)).toEqual(INVALID);
    db.answer = fail("pair_not_found");
    expect(await createAssistant(input)).toEqual({ ok: false, reason: "not_found" });
    db.answer = fail("boom", "XX000");
    expect(await createAssistant(input)).toEqual({ ok: false, reason: "failed" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("revokeDelegation", () => {
  it("revokes and refreshes", async () => {
    db.answer = { data: true, error: null };
    expect(await revokeDelegation(DELEGATION)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "revoke_delegation", { p_delegation_id: DELEGATION }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reads nothing revoked as not found", async () => {
    db.answer = { data: false, error: null };
    expect(await revokeDelegation(DELEGATION)).toEqual({ ok: false, reason: "not_found" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("refuses a bad id without a call", async () => {
    expect(await revokeDelegation("nope")).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });
});

describe("searchDelegates", () => {
  it("returns the candidates", async () => {
    db.answer = { data: [{ trainer_id: TRAINER, name: "Анна", username: "anna_coach" }], error: null };
    expect(await searchDelegates("@anna")).toEqual({ ok: true, value: [{ trainerId: TRAINER, name: "Анна", username: "anna_coach" }] });
    expect(db.calls).toEqual([["rpc", "search_delegate_trainers", { p_query: "@anna" }]]);
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("takes 64 characters and refuses more or a non-string without a call", async () => {
    db.answer = { data: [], error: null };
    expect(await searchDelegates("x".repeat(64))).toEqual({ ok: true, value: [] });
    db.calls = [];
    expect(await searchDelegates("x".repeat(65))).toEqual(INVALID);
    expect(await searchDelegates(null as unknown as string)).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });
});

describe("inviteDelegate", () => {
  it("sends the delegation to the trainer", async () => {
    expect(await inviteDelegate(DELEGATION, TRAINER)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "invite_delegate", { p_delegation_id: DELEGATION, p_trainer_id: TRAINER }]]);
  });

  it("refuses bad ids without a call", async () => {
    expect(await inviteDelegate("nope", TRAINER)).toEqual(INVALID);
    expect(await inviteDelegate(DELEGATION, "nope")).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });
});

describe("answerInvite", () => {
  it("accepts or declines by token and refreshes", async () => {
    expect(await answerInvite(TOKEN, true)).toEqual({ ok: true });
    expect(await answerInvite(TOKEN, false)).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["rpc", "accept_delegation", { p_token: TOKEN }],
      ["rpc", "decline_delegation", { p_token: TOKEN }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("reads a malformed token as not found, without a call", async () => {
    for (const token of ["", "short", "x".repeat(41), "has space in the token!!"]) expect(await answerInvite(token, true)).toEqual({ ok: false, reason: "not_found" });
    expect(db.calls).toEqual([]);
  });

  it("takes tokens of 20 and 40 characters", async () => {
    expect(await answerInvite("a".repeat(20), true)).toEqual({ ok: true });
    expect(await answerInvite("a".repeat(40), true)).toEqual({ ok: true });
  });
});

describe("setAssistantProgress", () => {
  it("switches what assistants see and refreshes", async () => {
    db.answer = { data: true, error: null };
    expect(await setAssistantProgress(PAIR, false)).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "set_assistant_progress", { p_coaching_id: PAIR, p_allowed: false }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reads an unchanged pair as not found and refuses a bad id without a call", async () => {
    db.answer = { data: false, error: null };
    expect(await setAssistantProgress(PAIR, true)).toEqual({ ok: false, reason: "not_found" });
    db.calls = [];
    expect(await setAssistantProgress("nope", true)).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });
});

describe("markDelegatedAttendance", () => {
  it("marks attended or no-show and refreshes", async () => {
    expect(await markDelegatedAttendance(id(5), "attended")).toEqual({ ok: true });
    expect(await markDelegatedAttendance(id(5), "no_show")).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["rpc", "mark_attendance", { p_booking_id: id(5), p_status: "attended" }],
      ["rpc", "mark_attendance", { p_booking_id: id(5), p_status: "no_show" }],
    ]);
    expect(next.refresh).toHaveBeenCalledTimes(2);
  });

  it("refuses another status or a bad id without a call", async () => {
    expect(await markDelegatedAttendance(id(5), "cancelled" as "attended")).toEqual(INVALID);
    expect(await markDelegatedAttendance("nope", "attended")).toEqual(INVALID);
    expect(db.calls).toEqual([]);
  });
});
