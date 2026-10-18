import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** Table and RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
  userId: "user-1" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    // A query records each step and resolves with db.answer whenever it is awaited.
    const query = (table: string) => {
      const steps: unknown[] = [table];
      db.calls.push(steps);
      const chain = {
        then: (resolve: (value: Answer) => unknown) => resolve(db.answer),
      } as Record<string, unknown>;
      for (const step of ["insert", "update", "delete", "select", "eq", "maybeSingle"]) {
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

const { acceptTrainerDpa, addNote, createCard, deleteNote, endCoaching, resolveClaim, setArchived, setSelfBookOnDebt, updateNote } = await import("./actions");

const PAIR = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const NOTE = "1c8d3a5f-2e3b-4d4c-8f9a-8b7c6d5e4f3a";

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  db.userId = "user-1";
});

describe("acceptTrainerDpa", () => {
  it("records the agreement version for the signed-in trainer", async () => {
    expect(await acceptTrainerDpa()).toEqual({ ok: true });
    expect(db.calls).toEqual([["consents", "insert", { user_id: "user-1", kind: "trainer_dpa", version: "2026-10-18" }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("takes an agreement accepted already as done", async () => {
    db.answer = { data: null, error: { message: "duplicate", code: "23505" } };
    expect(await acceptTrainerDpa()).toEqual({ ok: true });
  });

  it("fails without a session or on a database error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.userId = null;
    expect(await acceptTrainerDpa()).toEqual({ ok: false, reason: "invalid" });
    db.userId = "user-1";
    db.answer = { data: null, error: { message: "denied", code: "42501" } };
    expect(await acceptTrainerDpa()).toEqual({ ok: false, reason: "failed" });
  });
});

describe("notes", () => {
  it("adds a trimmed note as the signed-in author and refreshes the screen", async () => {
    expect(await addNote({ coachingId: PAIR, body: "  Left knee  ", visibleToClient: false })).toEqual({ ok: true });
    expect(db.calls).toEqual([
      ["coaching_notes", "insert", { coaching_id: PAIR, author_id: "user-1", body: "Left knee", visible_to_client: false }],
    ]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses an empty or too long note and a bad pair id without a query", async () => {
    expect(await addNote({ coachingId: PAIR, body: "   ", visibleToClient: false })).toEqual({ ok: false, reason: "invalid" });
    expect(await addNote({ coachingId: PAIR, body: "x".repeat(5001), visibleToClient: false })).toEqual({ ok: false, reason: "invalid" });
    expect(await addNote({ coachingId: "nope", body: "Hi", visibleToClient: false })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("needs a session to add a note", async () => {
    db.userId = null;
    expect(await addNote({ coachingId: PAIR, body: "Hi", visibleToClient: true })).toEqual({ ok: false, reason: "invalid" });
  });

  it("shows a note to the client", async () => {
    db.answer = { data: [{ id: NOTE }], error: null };
    expect(await updateNote({ noteId: NOTE, visibleToClient: true })).toEqual({ ok: true });
    expect(db.calls).toEqual([["coaching_notes", "update", { visible_to_client: true }, "eq", "id", NOTE, "select", "id"]]);
  });

  it("reports a note that RLS kept from changing as invalid, without a refresh", async () => {
    db.answer = { data: [], error: null };
    expect(await updateNote({ noteId: NOTE, body: "New text" })).toEqual({ ok: false, reason: "invalid" });
    expect(await deleteNote(NOTE)).toEqual({ ok: false, reason: "invalid" });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reports a database error as failed", async () => {
    db.answer = { data: null, error: { message: "boom", code: "XX000" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deleteNote(NOTE)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("pair settings", () => {
  it("archives a client and brings them back", async () => {
    db.answer = { data: [{ coaching_id: PAIR }], error: null };
    expect(await setArchived({ coachingId: PAIR, archived: false })).toEqual({ ok: true });
    expect(db.calls[0]).toEqual(["coaching_trainer_meta", "update", { archived_at: null }, "eq", "coaching_id", PAIR, "select", "coaching_id"]);
  });

  it("switches booking in debt", async () => {
    db.answer = { data: [{ id: PAIR }], error: null };
    expect(await setSelfBookOnDebt({ coachingId: PAIR, enabled: true })).toEqual({ ok: true });
    expect(db.calls[0]).toEqual(["coachings", "update", { self_book_on_debt: true }, "eq", "id", PAIR, "select", "id"]);
  });
});

describe("endCoaching", () => {
  it("ends the pair with the trimmed reason", async () => {
    db.answer = { data: 2, error: null };
    expect(await endCoaching({ coachingId: PAIR, reason: "  Moving  " })).toEqual({ ok: true });
    expect(db.calls).toEqual([["rpc", "end_coaching", { p_coaching_id: PAIR, p_reason: "Moving" }]]);
  });

  it("sends no reason when it is empty", async () => {
    await endCoaching({ coachingId: PAIR, reason: "   " });
    expect(db.calls).toEqual([["rpc", "end_coaching", { p_coaching_id: PAIR, p_reason: undefined }]]);
  });

  it("reads someone else's pair as invalid", async () => {
    db.answer = { data: null, error: { message: "coaching_not_found", code: "P0001" } };
    expect(await endCoaching({ coachingId: PAIR })).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses a reason over 500 characters", async () => {
    expect(await endCoaching({ coachingId: PAIR, reason: "x".repeat(501) })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });
});

describe("createCard", () => {
  it("creates a card with the trimmed fields and returns its pair", async () => {
    db.answer = { data: PAIR, error: null };
    expect(await createCard({ name: "  Аня ", contact: " +7 900 ", note: "  " })).toEqual({ ok: true, coachingId: PAIR });
    expect(db.calls).toEqual([["rpc", "create_managed_client", { p_display_name: "Аня", p_contact: "+7 900", p_note: undefined }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a missing or too long name and a too long contact without a call", async () => {
    expect(await createCard({ name: "  " })).toEqual({ ok: false, reason: "invalid" });
    expect(await createCard({ name: "x".repeat(101) })).toEqual({ ok: false, reason: "invalid" });
    expect(await createCard({ name: "Аня", contact: "x".repeat(201) })).toEqual({ ok: false, reason: "invalid" });
    expect(db.calls).toEqual([]);
  });

  it("reports the Free limit", async () => {
    db.answer = { data: null, error: { message: "plan_limit_reached", code: "P0001" } };
    expect(await createCard({ name: "Аня" })).toEqual({ ok: false, reason: "limit" });
  });

  it("reports a trainer who has not accepted the data processing agreement", async () => {
    db.answer = { data: null, error: { message: "dpa_required", code: "P0001" } };
    expect(await createCard({ name: "Аня" })).toEqual({ ok: false, reason: "dpa" });
  });
});

describe("resolveClaim", () => {
  const CLAIM = "2d9e4b6a-3f4c-4e5d-9a0b-9c8d7e6f5a4b";

  it("merges a card and returns the card pair", async () => {
    db.answer = { data: PAIR, error: null };
    expect(await resolveClaim({ claimId: CLAIM, cardId: NOTE })).toEqual({ ok: true, coachingId: PAIR, outcome: "merged" });
    expect(db.calls).toEqual([["rpc", "resolve_managed_client_claim", { p_claim_id: CLAIM, p_managed_client_id: NOTE }]]);
  });

  it("keeps a new client and tells whether the pair closed on Free", async () => {
    db.answer = { data: PAIR, error: null };
    // The mock answers the status query with the same row, which has no status: the pair stays.
    expect(await resolveClaim({ claimId: CLAIM, cardId: null })).toEqual({ ok: true, coachingId: PAIR, outcome: "new" });
    expect(db.calls[0]).toEqual(["rpc", "resolve_managed_client_claim", { p_claim_id: CLAIM, p_managed_client_id: undefined }]);
    expect(db.calls[1]).toEqual(["coachings", "select", "status", "eq", "id", PAIR, "maybeSingle"]);
  });

  it("reads a decided claim and a bad id apart from a failure", async () => {
    expect(await resolveClaim({ claimId: "nope", cardId: null })).toEqual({ ok: false, reason: "invalid" });
    db.answer = { data: null, error: { message: "claim_decided", code: "P0001" } };
    expect(await resolveClaim({ claimId: CLAIM, cardId: null })).toEqual({ ok: false, reason: "decided" });
    db.answer = { data: null, error: { message: "card_not_found", code: "P0001" } };
    expect(await resolveClaim({ claimId: CLAIM, cardId: NOTE })).toEqual({ ok: false, reason: "invalid" });
  });
});
