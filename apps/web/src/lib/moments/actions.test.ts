import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPC calls made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({ calls: [] as unknown[][], answer: { data: null, error: null } as Answer }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push([fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { createMomentCard } = await import("./actions");

const MILESTONE = "00000000-0000-4000-8000-000000000001";
const CARD = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.calls = [];
  db.answer = { data: CARD, error: null };
});

describe("createMomentCard", () => {
  it("freezes a milestone or a badge through create_moment_card and returns the card id", async () => {
    expect(await createMomentCard({ kind: "milestone", ref: MILESTONE })).toEqual({ status: "created", id: CARD });
    expect(await createMomentCard({ kind: "badge", ref: "sessions_10" })).toEqual({ status: "created", id: CARD });
    expect(db.calls).toEqual([
      ["create_moment_card", { p_kind: "milestone", p_ref: MILESTONE }],
      ["create_moment_card", { p_kind: "badge", p_ref: "sessions_10" }],
    ]);
  });

  it("sends nothing for an unknown kind, a bad milestone id or an unknown badge", async () => {
    for (const input of [
      { kind: "weight", ref: MILESTONE },
      { kind: "milestone", ref: "sessions_10" },
      { kind: "badge", ref: MILESTONE },
      { kind: "badge", ref: "'; drop table" },
    ]) {
      expect(await createMomentCard(input)).toEqual({ status: "failed" });
    }
    expect(db.calls).toEqual([]);
  });

  it("asks for the consent to publish story cards when the database wants it", async () => {
    db.answer = { data: null, error: { code: "P0001", message: "consent_required" } };
    expect(await createMomentCard({ kind: "badge", ref: "sessions_10" })).toEqual({ status: "consent" });
  });

  it("fails without the database's detail", async () => {
    db.answer = { data: null, error: { code: "P0001", message: "nothing_to_show" } };
    expect(await createMomentCard({ kind: "badge", ref: "sessions_10" })).toEqual({ status: "failed" });
    expect(console.error).toHaveBeenCalledWith("creating a moment card failed", "P0001");
  });
});
