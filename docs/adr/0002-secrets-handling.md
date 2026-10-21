# 2. Secrets are handled as production from day one

- Status: accepted
- Date: 2026-10-12

## Context

Fit uses secret credentials (Supabase secret key, Telegram bot token, and more to come). Development keys will be rotated before launch, but the code and processes must not depend on that: whatever works in development must be safe to run in production unchanged.

## Decision

1. **Environment variables only.** Secrets reach the app solely through env vars. They never appear in source code, the repo, commit messages, issues, PR descriptions, logs, error messages or analytics.
2. **`.env.example` is the contract.** Every variable the app reads is listed there with an empty value (or a public value) and a one-line comment saying whether it is public or server-only. Adding a variable to code without adding it to `.env.example` is a bug.
3. **Public vs server-only is explicit.**
   - `NEXT_PUBLIC_*` is reserved for values that are safe in the browser (Supabase URL, publishable key).
   - Everything else is server-only and is read in exactly one module (`src/env/server.ts`), which imports `server-only` so a client import fails the build.
4. **Validate at startup.** Env is parsed with a schema (zod) when the server boots; a missing or malformed variable fails fast with the variable *name* only, never its value.
5. **Separate keys per environment.** Local (`.env.local`), Vercel Preview and Vercel Production each get their own credentials. Production keys never go into local files or preview deployments. Telegram: a separate bot for dev/preview and for production.
6. **Least privilege.** Client code uses the Supabase publishable key and RLS. The Supabase secret key is used only in server code that really has to bypass RLS (admin jobs, webhooks), never to serve a user request on that user's behalf.
7. **Inbound webhooks are authenticated.** The Telegram webhook verifies `X-Telegram-Bot-Api-Secret-Token` against a server-only `TELEGRAM_WEBHOOK_SECRET`; other webhooks verify their provider's signature.
8. **Scanning.** A secret scanner (gitleaks) runs in CI on every push and PR once the app scaffold exists; a finding fails the build.
9. **Rotation is routine.** Every secret can be rotated without a code change: create new key → update Vercel env (and `.env.local`) → redeploy → revoke old key.

## Consequences

- Development keys shared during testing are treated as compromised and rotated before the production launch; nothing in the code needs to change for that.
- Agents never read `.env*.local`, never echo secret values, and never paste them into third-party fields; humans place secret values into Vercel and local env files.
- Slightly more setup up front (env module, schema, per-environment keys) in exchange for no "prod hardening" pass later.

## Notes (2026-10-15)

On §5. The bot's Vercel project `dafit-bot` has Telegram variables in Production only. Its `/healthz` shows `bot_id`, the public id of the bot whose token the deployment holds, so a token that slipped into a preview shows up there. Local development uses a separate dev bot, and local polling refuses to start with @fitconnection_bot.

On §7. The webhook secret defaults to HMAC-SHA256 of a fixed label (`dafit/telegram-webhook-secret/v1`) keyed with the bot token, in hex. It lives wherever the token lives and rotates with it. Whoever holds the token can call `setWebhook` anyway, so this adds no exposure. `TELEGRAM_WEBHOOK_SECRET` overrides it, which keeps rotation of the secret alone possible without a code change (§9). Set it in every store that holds the token for the bot (Vercel `dafit-bot` Production and the GitHub repository secrets) or in none.

GitHub Actions (updated 2026-10-21). This note was first written while the repo was private, when GitHub offered environment secrets there only on paid plans. The repo is now public. `SUPABASE_DB_URL` is a secret of the environment `supabase-fit`, used by `Database deploy`; `TELEGRAM_BOT_TOKEN` is still a repository secret, which any workflow on any branch can read. Only the owner and Claude sessions push here. A workflow passes a secret only to the step that needs it, and a job that uses one runs only on `main`; `Bot setup` follows this. `Database deploy` predates the rule: it gives `SUPABASE_DB_URL` to the whole job and does not check the branch when started by hand. Database copies are not made in this repo, because anyone can download the artifacts of a public repo: the private repository `fit-backups` calls `db-backup.yml` and keeps its own `SUPABASE_DB_URL`, the copy passphrase and the copies.
