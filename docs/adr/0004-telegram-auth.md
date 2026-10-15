# 4. Web2 sign-in with Telegram, sessions from Supabase Auth

- Status: accepted
- Date: 2026-10-12

## Context

Users sign in with their Telegram account only — no passwords, no email, no wallets. Two entry points:
inside Telegram (Mini App) and on the website in a normal browser. Data access must go through Supabase RLS.

## Decision

Two ways to **prove** a Telegram identity, one way to **create a session**:

1. **Mini App** — the client posts raw `initData` to `POST /api/auth/telegram/mini-app`. The server checks the HMAC
   (`secret = HMAC_SHA256("WebAppData", bot_token)`), rejects data older than `TELEGRAM_INIT_DATA_MAX_AGE`
   (default 1 h), and trusts only the verified `user` field. `initDataUnsafe` is never trusted.
2. **Website** — Telegram Login via **OpenID Connect** (https://core.telegram.org/bots/telegram-login):
   `/auth/telegram/login` → `oauth.telegram.org/auth` (Authorization Code + PKCE S256, `state`, `nonce`, scope
   `openid profile`) → `/auth/telegram/callback` exchanges the code with the client secret and verifies the
   `id_token` against Telegram's JWKS (`iss = https://oauth.telegram.org`, `aud` = bot id, `exp`, `nonce`).
   The legacy hash-checked widget is not used.
3. **Session** — `signInWithTelegram()` (server-only) ensures a Supabase auth user exists
   (`app_metadata.telegram_id`, synthetic non-deliverable email `tg<id>@users.fit.invalid`), upserts
   `public.profiles`, mints a one-time magic-link token with the admin API and redeems it immediately with the
   cookie-bound client. Result: a normal Supabase session in httpOnly cookies, so RLS works with `auth.uid()`.

`app_metadata.telegram_id` is the stable identity key (users can't edit `app_metadata`).
`proxy.ts` refreshes the session on each request; protected pages also check on the server.

## Inside the Mini App (added 2026-10-15)

Inside Telegram the account is the Telegram account the Mini App was opened with. The client signs in from
`initData` on every page load: after a full page load the URL no longer has the launch hash, and tma.js reads the
launch params it saved in `sessionStorage` (`tapps/launchParams`) on the first load. So the Mini App has no
sign-out: the next page load would sign the user in again.

The OIDC page on `oauth.telegram.org` does not load inside Telegram, so the Mini App never links to it. `/login`
inside Telegram signs in from `initData` and opens `next`. If the request fails, the button sends it again. If there
is no `initData`, or the server rejects it (older than `TELEGRAM_INIT_DATA_MAX_AGE`), the page asks to close the
app and open it again: only a new launch brings fresh `initData`. The website keeps sign-out and the OIDC button.

## Required Supabase settings

- Authentication → Sign In / Providers: **Allow new users to sign up = off** (admin `createUser` still works); no password or social providers enabled.
- Secure email change on. Users must not be able to sign up or change email to a `tg…@users.fit.invalid` address.
- `signInWithTelegram()` additionally refuses any account whose `app_metadata.telegram_id` doesn't match the verified identity. `app_metadata.provider` is not checked: Supabase Auth owns it and rewrites it to `email` when the magic-link token is redeemed.

## Hardening in code

- Session cookies are httpOnly + Secure (prod); the browser never reads the session.
- Sign-in and sign-out POSTs require same-origin `Origin` / `Sec-Fetch-Site`; the Mini App endpoint also requires `application/json`.
- Post-login redirects are resolved with `new URL()` and must stay on our origin.
- `id_token` algorithms are pinned; `nonce` must round-trip (verify on the first real login that Telegram echoes it).

## Consequences

- One user record per Telegram account regardless of entry point.
- Requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_LOGIN_CLIENT_ID`, `TELEGRAM_LOGIN_CLIENT_SECRET`, `SUPABASE_SECRET_KEY` on the web server.
- In @BotFather → Login Widget, every origin and `https://<host>/auth/telegram/callback` must be registered per environment.
- If Supabase Auth adds native Telegram OIDC, the session step can be swapped without touching the verification code.
