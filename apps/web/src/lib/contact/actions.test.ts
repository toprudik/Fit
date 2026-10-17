import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));

const BOT_TOKEN = "123456:TEST-token_for-unit-tests";
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_TOKEN: BOT_TOKEN }) }));

/** RPC calls as the signed-in user ("user") and with the secret key ("admin"), and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as { as: string; fn: string; args: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as { message: string; code: string } | null },
  claims: { sub: "user-1", app_metadata: { telegram_id: 42 } } as Record<string, unknown> | null,
}));
const client = (as: string) => ({
  rpc: (fn: string, args: Record<string, unknown>) => {
    db.calls.push({ as, fn, args });
    return Promise.resolve(db.answer);
  },
  auth: { getClaims: async () => ({ data: db.claims ? { claims: db.claims } : null }) },
});
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => client("user") }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client("admin") }));

const { askToContact, declineContact, shareContact } = await import("./actions");

const PAIR = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const REQUEST = "5a1e3cc4-e5f3-4d31-9cc0-9cf56a876699";

/** A requestContact answer signed like Telegram does. */
function signedContact(contact: Record<string, unknown>, authDate = Math.floor(Date.now() / 1000)): string {
  const fields = { auth_date: String(authDate), contact: JSON.stringify(contact) };
  const dcs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(dcs).digest("hex") }).toString();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.calls = [];
  db.answer = { data: null, error: null };
  db.claims = { sub: "user-1", app_metadata: { telegram_id: 42 } };
});

describe("askToContact", () => {
  it("asks through request_contact and reloads the card", async () => {
    db.answer = { data: REQUEST, error: null };
    expect(await askToContact(PAIR)).toEqual({ status: "sent" });
    expect(db.calls).toEqual([{ as: "user", fn: "request_contact", args: { p_coaching_id: PAIR } }]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ["too_soon", "too_soon"],
    ["has_username", "unavailable"],
    ["recipient_unavailable", "unavailable"],
    ["pair_ended", "unavailable"],
    ["pair_not_found", "failed"],
  ])("maps %s to %s", async (message, reason) => {
    db.answer = { data: null, error: { message, code: "P0001" } };
    expect(await askToContact(PAIR)).toEqual({ status: "error", reason });
  });
});

describe("declineContact", () => {
  it("declines as the signed-in user", async () => {
    db.answer = { data: "declined", error: null };
    expect(await declineContact(REQUEST)).toEqual({ status: "declined" });
    expect(db.calls).toEqual([{ as: "user", fn: "decline_contact_request", args: { p_request_id: REQUEST } }]);
  });

  it("refuses a malformed id without asking the database", async () => {
    expect(await declineContact("42")).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });
});

describe("shareContact", () => {
  it("passes on the number Telegram signed for the user's own account", async () => {
    db.answer = { data: "accepted", error: null };
    const raw = signedContact({ user_id: 42, phone_number: "79991234567", first_name: "Sam" });
    expect(await shareContact(REQUEST, raw)).toEqual({ status: "accepted" });
    expect(db.calls).toEqual([
      { as: "admin", fn: "accept_contact_request", args: { p_request_id: REQUEST, p_user: "user-1", p_phone: "79991234567" } },
    ]);
  });

  it("refuses a contact of another Telegram account", async () => {
    const raw = signedContact({ user_id: 7, phone_number: "79991234567" });
    expect(await shareContact(REQUEST, raw)).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("refuses a contact someone changed or an old one", async () => {
    const changed = signedContact({ user_id: 42, phone_number: "79991234567" }).replace("79991234567", "70000000000");
    expect(await shareContact(REQUEST, changed)).toEqual({ status: "failed" });
    const old = signedContact({ user_id: 42, phone_number: "79991234567" }, Math.floor(Date.now() / 1000) - 3600);
    expect(await shareContact(REQUEST, old)).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });

  it("refuses without a session", async () => {
    db.claims = null;
    expect(await shareContact(REQUEST, signedContact({ user_id: 42, phone_number: "79991234567" }))).toEqual({ status: "failed" });
    expect(db.calls).toEqual([]);
  });
});
