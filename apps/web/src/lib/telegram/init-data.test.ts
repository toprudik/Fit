import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InitDataError, verifyInitData } from "./init-data";

const BOT_TOKEN = "123456:TEST-token_for-unit-tests";
const NOW = new Date("2026-10-12T12:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const dcs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const user = JSON.stringify({ id: 42, first_name: "Sam", username: "sam", language_code: "ru" });
const opts = { botToken: BOT_TOKEN, maxAgeSeconds: 3600, now: NOW };

describe("verifyInitData", () => {
  it("accepts correctly signed, fresh data", () => {
    const raw = sign({ auth_date: String(nowSec - 10), query_id: "AAA", user });
    expect(verifyInitData(raw, opts)).toMatchObject({ telegramId: 42, username: "sam", firstName: "Sam", source: "mini-app" });
  });

  it("rejects data signed with another bot token", () => {
    const raw = sign({ auth_date: String(nowSec), user }, "999:other");
    expect(() => verifyInitData(raw, opts)).toThrow(InitDataError);
  });

  it("rejects tampered fields", () => {
    const raw = sign({ auth_date: String(nowSec), user }).replace("%22id%22%3A42", "%22id%22%3A43");
    expect(() => verifyInitData(raw, opts)).toThrow("signature mismatch");
  });

  it("rejects expired data", () => {
    const raw = sign({ auth_date: String(nowSec - 7200), user });
    expect(() => verifyInitData(raw, opts)).toThrow("expired");
  });

  it("rejects a missing hash", () => {
    expect(() => verifyInitData(`auth_date=${nowSec}&user=${encodeURIComponent(user)}`, opts)).toThrow(InitDataError);
  });
});
