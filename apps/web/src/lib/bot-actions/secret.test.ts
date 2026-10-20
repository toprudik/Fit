import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { botActionsSecret, isBotAuthorized } = await import("./secret");

const TOKEN = "123456:TEST-token_for-unit-tests";
/**
 * hex(HMAC-SHA256(key=TOKEN, msg="dafit/bot-actions/v1")). apps/bot/tests/test_web_contract.py checks the bot
 * derives the same value; change both together, or every button in the bot stops working.
 */
const VECTOR = "9c029edef8f0c99afcfe14cb5b30ce0ed8e3527d33f1c495bfb1c063c1075a5f";

describe("botActionsSecret", () => {
  it("matches the value the bot derives from the same token", () => {
    expect(botActionsSecret(TOKEN)).toBe(VECTOR);
  });

  it("changes with the token", () => {
    expect(botActionsSecret("654321:TEST-other")).not.toBe(VECTOR);
  });
});

describe("isBotAuthorized", () => {
  it("lets in the bot's bearer secret", () => {
    expect(isBotAuthorized(`Bearer ${VECTOR}`, TOKEN)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["the secret without Bearer", VECTOR],
    ["the token itself", `Bearer ${TOKEN}`],
    ["another token's secret", `Bearer ${botActionsSecret("654321:TEST-other")}`],
    ["a secret cut short", `Bearer ${VECTOR.slice(0, -1)}`],
    ["upper-case hex", `Bearer ${VECTOR.toUpperCase()}`],
    ["a trailing space", `Bearer ${VECTOR} `],
  ])("refuses %s", (_name, header) => {
    expect(isBotAuthorized(header, TOKEN)).toBe(false);
  });
});
