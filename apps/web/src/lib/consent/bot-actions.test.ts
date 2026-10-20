import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: next.revalidatePath }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push(["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { setBotMessages } = await import("./bot-actions");

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
});

describe("setBotMessages", () => {
  it("saves an allowed answer without a test message by default and revalidates the layout", async () => {
    expect(await setBotMessages(true)).toBe(true);
    expect(db.calls).toEqual([["rpc", "set_bot_messages", { p_allowed: true, p_send_test: false }]]);
    expect(next.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("asks for the test message when told to", async () => {
    await setBotMessages(true, true);
    expect(db.calls).toEqual([["rpc", "set_bot_messages", { p_allowed: true, p_send_test: true }]]);
  });

  it("saves a refusal", async () => {
    expect(await setBotMessages(false)).toBe(true);
    expect(db.calls).toEqual([["rpc", "set_bot_messages", { p_allowed: false, p_send_test: false }]]);
  });

  it("answers false on an error, logs only its code and revalidates nothing", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.answer = { data: null, error: { message: "not_authenticated", code: "28000" } };
    expect(await setBotMessages(true)).toBe(false);
    expect(logged).toHaveBeenCalledWith("saving bot message access failed", "28000");
    expect(next.revalidatePath).not.toHaveBeenCalled();
  });
});
