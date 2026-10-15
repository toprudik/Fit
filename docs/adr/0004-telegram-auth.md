# 4. Web2 sign-in with Telegram, sessions from Supabase Auth

- Status: accepted
- Date: 2026-10-12

## Context

Users sign in with their Telegram account only — no passwords, no email, no wallets. Two entry points:
inside Telegram (Mini App) and on the website in a normal browser. Data access must go through Supabase RLS.

## Decision

Two ways to **prove** a Telegram identity, one way to **create a session**:

1. **Mini App** — the client posts raw `initData` to `POST /api/auth/telegram/mini-app`. The server checks the HMAC
   (`secret = HMAC_SHA256("WebAppData", bot_token)`) and trusts only the verified `user` field. A new session needs
   data no older than `TELEGRAM_INIT_DATA_MAX_AGE` (default 1 h). When the request already carries a session of the
   same Telegram user, genuine data of any age is enough and nothing changes: a Mini App opened more than an hour ago
   still sends its launch's `initData` on every page load. `initDataUnsafe` is never trusted.
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
inside Telegram signs in from `initData` and opens `next`, which is never a route handler (`/auth/…`, `/api/…`) or
`/login` itself. An answer from earlier on the page load says nothing about the session now: it may have expired, or a
sign-out on the website ended every session. So when the app navigates to `/login`, the page sends `initData` again
and follows only the new answer. If the request fails, the button sends it again. If there is no `initData`, or the
server rejects it (too old to start a new session), the page asks to close the app and open it again: only a new
launch brings fresh `initData`. The website keeps sign-out and the OIDC button.

Before the app's scripts run, the pre-paint script in `<head>` marks `<html data-telegram>` when the URL has launch
params or tma.js saved them in this tab (`tapps/launchParams`). Under that mark `/login` hides the OIDC link and
shows a busy button, so a tap on a slow connection can't open the OIDC page. The Telegram provider removes the mark
when the SDK does not start.

## Required Supabase settings

- Authentication → Sign In / Providers: **Allow new users to sign up = off** (admin `createUser` still works); no password or social providers enabled.
- Secure email change on. Users must not be able to sign up or change email to a `tg…@users.fit.invalid` address.
- `signInWithTelegram()` additionally refuses any account whose `app_metadata.telegram_id` doesn't match the verified identity. `app_metadata.provider` is not checked: Supabase Auth owns it and rewrites it to `email` when the magic-link token is redeemed.

## Hardening in code

- Session cookies are httpOnly; the browser never reads the session.
- In production the session cookies and the preference cookies (`dafit-locale`, `dafit-theme`, `dafit-zone`, ADR 0015)
  are `SameSite=None; Secure; Partitioned` (`src/lib/cookie-attributes.ts`). Telegram Web runs the Mini App in an
  iframe on `web.telegram.org`, and browsers neither store nor send `SameSite=Lax` cookies in a cross-site iframe:
  there the session never stuck, and the reload for the language looped. `Partitioned` (CHIPS) keeps the cookies in a
  jar per top-level site, so they survive where third-party cookies are blocked, and cookies set inside Telegram Web
  never go along when another site embeds or calls the app. The server and the browser write these cookies with the
  same attributes, and `@supabase/ssr` refreshes and deletes the session with them (`src/proxy.ts`,
  `src/lib/supabase/server.ts`): a partitioned cookie is replaced or deleted only by a partitioned `Set-Cookie`. In
  development over plain http they stay `Lax`, since `None` requires `Secure`. The OIDC cookie stays `Lax`: that flow
  runs only top-level on the website.
- CSRF: with `SameSite=None` the browser attaches the cookies to cross-site requests in the same partition, such as a
  form another site posts to the app (a top-level navigation lands in the app's own partition). SameSite no longer
  protects anything, so every state-changing route handler checks the origin itself: sign-in
  (`/api/auth/telegram/mini-app`, which also takes only `application/json`) and sign-out (`/auth/sign-out`) require a
  same-origin `Origin` / `Sec-Fetch-Site` (`isSameOrigin`). A new state-changing route handler must do the same. The
  GET handlers change no account: `/auth/telegram/login` only starts the OIDC flow, and `/auth/telegram/callback`
  signs in only with a matching `state`, PKCE verifier and `nonce`. Page loads only refresh the session and remember
  the zone. There are no Server Actions yet; Next.js compares their `Origin` with the host itself. CSP
  `frame-ancestors` lets only Telegram frame the app.
- If a browser still drops the cookies (all cookies blocked), the Mini App does not loop: it reloads for the language
  at most once per tab, and when the language cookie the server just set is missing, it stays on the page and asks to
  open DaFit in the Telegram app on a phone or computer.
- Post-login redirects are resolved with `new URL()`, must stay on our origin and never go to a route handler or `/login`.
- `id_token` algorithms are pinned; `nonce` must round-trip (verify on the first real login that Telegram echoes it).

## Consequences

- One user record per Telegram account regardless of entry point.
- Requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_LOGIN_CLIENT_ID`, `TELEGRAM_LOGIN_CLIENT_SECRET`, `SUPABASE_SECRET_KEY` on the web server.
- In @BotFather → Login Widget, every origin and `https://<host>/auth/telegram/callback` must be registered per environment.
- If Supabase Auth adds native Telegram OIDC, the session step can be swapped without touching the verification code.
