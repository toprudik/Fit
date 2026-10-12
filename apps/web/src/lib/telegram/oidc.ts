import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { TelegramIdentity } from "./identity";

/**
 * Telegram Login (OpenID Connect, Authorization Code + PKCE).
 * https://core.telegram.org/bots/telegram-login
 */
export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const AUTHORIZE_URL = `${TELEGRAM_ISSUER}/auth`;
const TOKEN_URL = `${TELEGRAM_ISSUER}/token`;
const JWKS_URL = new URL(`${TELEGRAM_ISSUER}/.well-known/jwks.json`);

export const OIDC_SCOPES = "openid profile";

let jwks: JWTVerifyGetKey | undefined;
const telegramJwks = () => (jwks ??= createRemoteJWKSet(JWKS_URL));

const b64url = (buf: Buffer) => buf.toString("base64url");
const random = () => b64url(randomBytes(32));

export type AuthorizationRequest = { url: string; state: string; nonce: string; codeVerifier: string };

export function createAuthorizationRequest({ clientId, redirectUri }: { clientId: string; redirectUri: string }): AuthorizationRequest {
  const state = random();
  const nonce = random();
  const codeVerifier = random();
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OIDC_SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), state, nonce, codeVerifier };
}

export class OidcError extends Error {}

export async function exchangeCodeForIdToken(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      code_verifier: input.codeVerifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new OidcError(`token endpoint returned ${res.status}`);
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string") throw new OidcError("no id_token in token response");
  return body.id_token;
}

/**
 * Verifies signature (JWKS), issuer, audience, expiry and nonce.
 * `audiences` should contain the bot id (Telegram docs: aud = Bot ID); the client id is accepted too.
 */
export async function verifyIdToken(
  idToken: string,
  { audiences, nonce, keys = telegramJwks() }: { audiences: string[]; nonce: string; keys?: JWTVerifyGetKey },
): Promise<TelegramIdentity> {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: TELEGRAM_ISSUER,
    audience: [...new Set(audiences)],
    clockTolerance: 30,
    algorithms: ["RS256", "ES256", "EdDSA", "ES256K"],
  });
  if (payload.nonce !== nonce) throw new OidcError("nonce mismatch");

  const id = Number(payload.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new OidcError("missing telegram id claim");

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    telegramId: id,
    username: str(payload.preferred_username),
    firstName: str(payload.given_name) ?? str(payload.name),
    lastName: str(payload.family_name),
    photoUrl: str(payload.picture),
    languageCode: null,
    source: "oidc",
  };
}
