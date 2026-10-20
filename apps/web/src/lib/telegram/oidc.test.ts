import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { TELEGRAM_ISSUER, createAuthorizationRequest, verifyIdToken } from "./oidc";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const token = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string | number } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? TELEGRAM_ISSUER)
      .setAudience(opts.aud ?? "123456")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(privateKey);
  return { keys, token };
}

const claims = { sub: "s1", id: 42, name: "Sam R", given_name: "Sam", preferred_username: "sam", nonce: "n1" };

describe("verifyIdToken", () => {
  it("returns the identity for a valid token", async () => {
    const { keys, token } = await setup();
    const identity = await verifyIdToken(await token(claims), { audiences: ["123456"], nonce: "n1", keys });
    expect(identity).toMatchObject({ telegramId: 42, username: "sam", firstName: "Sam", source: "oidc" });
  });

  it("rejects a wrong audience", async () => {
    const { keys, token } = await setup();
    await expect(verifyIdToken(await token(claims, { aud: "999" }), { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow();
  });

  it("rejects a wrong issuer", async () => {
    const { keys, token } = await setup();
    await expect(
      verifyIdToken(await token(claims, { iss: "https://evil.example" }), { audiences: ["123456"], nonce: "n1", keys }),
    ).rejects.toThrow();
  });

  it("rejects a nonce mismatch", async () => {
    const { keys, token } = await setup();
    await expect(verifyIdToken(await token(claims), { audiences: ["123456"], nonce: "other", keys })).rejects.toThrow("nonce");
  });

  it("rejects an expired token", async () => {
    const { keys, token } = await setup();
    const expired = await token(claims, { exp: Math.floor(Date.now() / 1000 - 3600) });
    await expect(verifyIdToken(expired, { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow();
  });
});

describe("createAuthorizationRequest", () => {
  it("builds a PKCE S256 request with state and nonce", () => {
    const req = createAuthorizationRequest({ clientId: "123456", redirectUri: "https://fit.example/auth/telegram/callback" });
    const url = new URL(req.url);
    expect(url.origin + url.pathname).toBe(`${TELEGRAM_ISSUER}/auth`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("state")).toBe(req.state);
    expect(url.searchParams.get("nonce")).toBe(req.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(req.codeVerifier).digest("base64url"));
  });

  it("makes new, unguessable state, nonce and verifier every time", () => {
    const a = createAuthorizationRequest({ clientId: "123456", redirectUri: "https://fit.example/auth/telegram/callback" });
    const b = createAuthorizationRequest({ clientId: "123456", redirectUri: "https://fit.example/auth/telegram/callback" });
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.state.length).toBeGreaterThanOrEqual(16);
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("verifyIdToken against forgeries", () => {
  it("rejects a token signed by another key", async () => {
    const { keys } = await setup();
    const other = await setup();
    await expect(verifyIdToken(await other.token(claims), { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow();
  });

  it("rejects an unsigned token (alg none)", async () => {
    const { keys } = await setup();
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = { ...claims, iss: TELEGRAM_ISSUER, aud: "123456", iat: now, exp: now + 300 };
    const unsigned = `${encode({ alg: "none", kid: "k1" })}.${encode(body)}.`;
    await expect(verifyIdToken(unsigned, { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow();
  });

  it("rejects an HMAC token keyed with something public", async () => {
    const { keys } = await setup();
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .setIssuer(TELEGRAM_ISSUER)
      .setAudience("123456")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("123456"));
    await expect(verifyIdToken(forged, { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow();
  });

  it("rejects a token without a usable Telegram id", async () => {
    const { keys, token } = await setup();
    for (const id of [undefined, 0, -5, "abc", 1.5]) {
      await expect(verifyIdToken(await token({ ...claims, id }), { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow(
        "telegram id",
      );
    }
  });

  it("rejects a token without a nonce", async () => {
    const { keys, token } = await setup();
    await expect(verifyIdToken(await token({ ...claims, nonce: undefined }), { audiences: ["123456"], nonce: "n1", keys })).rejects.toThrow(
      "nonce",
    );
  });
});
