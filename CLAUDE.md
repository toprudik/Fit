# Fit

## Infrastructure

- **Hosting**: Vercel, team `rudiks-projects-1924b04c`. Project not created yet — create it and link `toprudik/Fit` once the app scaffold exists.
- **Backend**: Supabase project `fit` (ref `zxwabddqqtitybtsdeqp`, `us-east-1`). See `docs/adr/0001-supabase-backend.md`.
- **Telegram bot**: `@fitconnection_bot`. Token is server-only (`TELEGRAM_BOT_TOKEN`), never in the repo or client code.
- **Env & secrets**: build as production from day one — see `docs/adr/0002-secrets-handling.md`. Every variable is listed in `.env.example` (public vs server-only); `NEXT_PUBLIC_*` only for browser-safe values; server-only vars are read solely via `src/env/server.ts` (`server-only` + zod validation, errors name the variable, never the value); separate keys per environment (local / preview / production). Never read or commit `.env*.local`, never print secret values.
- **Database rules**: RLS on every exposed table; schema changes only via migrations in `supabase/migrations/`; run Supabase security advisors after DDL changes.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `toprudik/fit`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
