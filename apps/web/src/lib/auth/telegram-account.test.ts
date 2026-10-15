import { describe, expect, it } from "vitest";
import { isTelegramAccount } from "./telegram-account";

describe("isTelegramAccount", () => {
  it("accepts the account created for this Telegram user", () => {
    expect(isTelegramAccount({ provider: "telegram", telegram_id: 42 }, 42)).toBe(true);
  });

  it("accepts it again after Supabase rewrote provider on the first sign-in", () => {
    expect(isTelegramAccount({ provider: "email", providers: ["email"], telegram_id: 42 }, 42)).toBe(true);
  });

  it("refuses another Telegram user's account", () => {
    expect(isTelegramAccount({ provider: "email", telegram_id: 43 }, 42)).toBe(false);
  });

  it("refuses an account without telegram_id, e.g. one registered by email", () => {
    expect(isTelegramAccount({ provider: "email" }, 42)).toBe(false);
    expect(isTelegramAccount(undefined, 42)).toBe(false);
  });

  it("refuses a telegram_id stored as a string", () => {
    expect(isTelegramAccount({ telegram_id: "42" }, 42)).toBe(false);
  });
});
