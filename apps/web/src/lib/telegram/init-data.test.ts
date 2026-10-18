import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertInitDataFresh, InitDataError, verifyInitData, verifyRequestedContact } from "./init-data";

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
const opts = { botToken: BOT_TOKEN, now: NOW };

describe("verifyInitData", () => {
  it("accepts correctly signed data and says when Telegram signed it", () => {
    const raw = sign({ auth_date: String(nowSec - 10), query_id: "AAA", user });
    const verified = verifyInitData(raw, opts);
    expect(verified.identity).toMatchObject({ telegramId: 42, username: "sam", firstName: "Sam", source: "mini-app" });
    expect(verified.authDate).toBe(nowSec - 10);
  });

  it("accepts genuine data of any age: the age matters only for a new session", () => {
    const raw = sign({ auth_date: String(nowSec - 7 * 24 * 3600), user });
    expect(verifyInitData(raw, opts).identity.telegramId).toBe(42);
  });

  it("rejects data from the future", () => {
    const raw = sign({ auth_date: String(nowSec + 3600), user });
    expect(() => verifyInitData(raw, opts)).toThrow("future");
  });

  it("rejects data signed with another bot token", () => {
    const raw = sign({ auth_date: String(nowSec), user }, "999:other");
    expect(() => verifyInitData(raw, opts)).toThrow(InitDataError);
  });

  it("rejects tampered fields", () => {
    const raw = sign({ auth_date: String(nowSec), user }).replace("%22id%22%3A42", "%22id%22%3A43");
    expect(() => verifyInitData(raw, opts)).toThrow("signature mismatch");
  });

  it("rejects a missing hash", () => {
    expect(() => verifyInitData(`auth_date=${nowSec}&user=${encodeURIComponent(user)}`, opts)).toThrow(InitDataError);
  });
});

describe("assertInitDataFresh", () => {
  const fresh = { botToken: BOT_TOKEN, now: NOW };
  const limits = { maxAgeSeconds: 3600, now: NOW };

  it("lets fresh data start a session", () => {
    const verified = verifyInitData(sign({ auth_date: String(nowSec - 3599), user }), fresh);
    expect(() => assertInitDataFresh(verified, limits)).not.toThrow();
  });

  it("rejects data older than the limit", () => {
    const verified = verifyInitData(sign({ auth_date: String(nowSec - 7200), user }), fresh);
    expect(() => assertInitDataFresh(verified, limits)).toThrow(InitDataError);
    expect(() => assertInitDataFresh(verified, limits)).toThrow("expired");
  });
});

describe("verifyRequestedContact", () => {
  const contact = JSON.stringify({ user_id: 42, phone_number: "79991234567", first_name: "Sam" });

  it("returns the phone number and the Telegram id Telegram signed", () => {
    const raw = sign({ auth_date: String(nowSec - 5), contact });
    expect(verifyRequestedContact(raw, opts)).toEqual({ telegramId: 42, phone: "79991234567", authDate: nowSec - 5 });
  });

  it("rejects a contact someone changed", () => {
    const raw = sign({ auth_date: String(nowSec), contact }).replace("79991234567", "70000000000");
    expect(() => verifyRequestedContact(raw, opts)).toThrow(InitDataError);
  });

  it("rejects a signed answer without a usable contact", () => {
    expect(() => verifyRequestedContact(sign({ auth_date: String(nowSec), contact: "null" }), opts)).toThrow("malformed contact");
    expect(() => verifyRequestedContact(sign({ auth_date: String(nowSec), user }), opts)).toThrow("malformed contact");
    const noPhone = JSON.stringify({ user_id: 42, first_name: "Sam" });
    expect(() => verifyRequestedContact(sign({ auth_date: String(nowSec), contact: noPhone }), opts)).toThrow("phone");
  });
});

describe("verifyInitData against forgeries", () => {
  it("rejects a hash computed with the bot token directly instead of the WebAppData key", () => {
    const fields = { auth_date: String(nowSec), user };
    const dcs = Object.entries(fields)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("\n");
    const hash = createHmac("sha256", BOT_TOKEN).update(dcs).digest("hex");
    expect(() => verifyInitData(new URLSearchParams({ ...fields, hash }).toString(), opts)).toThrow("signature mismatch");
  });

  it("rejects a hash in another form than 64 lowercase hex characters", () => {
    const raw = sign({ auth_date: String(nowSec), user });
    const hash = new URLSearchParams(raw).get("hash")!;
    expect(() => verifyInitData(raw.replace(hash, hash.toUpperCase()), opts)).toThrow("malformed hash");
    expect(() => verifyInitData(raw.replace(hash, hash.slice(0, 63)), opts)).toThrow("malformed hash");
    expect(() => verifyInitData(raw.replace(hash, ""), opts)).toThrow("malformed hash");
  });

  it("rejects a field added after signing", () => {
    const raw = `${sign({ auth_date: String(nowSec), user })}&start_param=ti_admin`;
    expect(() => verifyInitData(raw, opts)).toThrow("signature mismatch");
  });

  it("rejects a second user field appended after signing", () => {
    const other = encodeURIComponent(JSON.stringify({ id: 1, first_name: "Admin" }));
    expect(() => verifyInitData(`${sign({ auth_date: String(nowSec), user })}&user=${other}`, opts)).toThrow("signature mismatch");
  });

  it("rejects a moved auth_date: replaying old data with a new date breaks the signature", () => {
    const raw = sign({ auth_date: String(nowSec - 7200), user }).replace(String(nowSec - 7200), String(nowSec));
    expect(() => verifyInitData(raw, opts)).toThrow("signature mismatch");
  });

  it("rejects empty and garbage input", () => {
    for (const raw of ["", "hash=", "user=%7B%7D", "%%%"]) expect(() => verifyInitData(raw, opts)).toThrow(InitDataError);
  });

  it("rejects genuine data without auth_date", () => {
    expect(() => verifyInitData(sign({ user }), opts)).toThrow("auth_date");
    expect(() => verifyInitData(sign({ auth_date: "soon", user }), opts)).toThrow("auth_date");
  });

  it("rejects genuine data without a user, or with a user Telegram never sends", () => {
    expect(() => verifyInitData(sign({ auth_date: String(nowSec), query_id: "AAA" }), opts)).toThrow("missing user");
    expect(() => verifyInitData(sign({ auth_date: String(nowSec), user: "{not json" }), opts)).toThrow("malformed user");
    for (const id of ['"42"', "4.2", "null", "9007199254740993"]) {
      const raw = sign({ auth_date: String(nowSec), user: `{"id":${id},"first_name":"Sam"}` });
      expect(() => verifyInitData(raw, opts)).toThrow("malformed user id");
    }
  });

  it("rejects a signed contact answer used as initData", () => {
    const contact = JSON.stringify({ user_id: 42, phone_number: "79991234567" });
    expect(() => verifyInitData(sign({ auth_date: String(nowSec), contact }), opts)).toThrow("missing user");
  });

  it("takes only the signed user fields: names that are not strings are dropped", () => {
    const odd = JSON.stringify({ id: 42, first_name: { toString: "x" }, username: ["sam"], photo_url: "" });
    const { identity } = verifyInitData(sign({ auth_date: String(nowSec), user: odd }), opts);
    expect(identity).toMatchObject({ telegramId: 42, firstName: null, username: null, photoUrl: null });
  });
});
