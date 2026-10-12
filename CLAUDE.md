# Fit

Web app + Telegram Mini App (`apps/web`, Next.js) and Telegram bot (`apps/bot`, aiogram). Stack and layout: `docs/adr/0003-stack-and-runtime.md`. Run locally with `docker compose up` (see README).

## Working in this repo

- **apps/web**: Next.js 16 differs from older versions — read `apps/web/AGENTS.md` and the bundled docs in `apps/web/node_modules/next/dist/docs/` before writing Next.js code. Cache Components are on: anything reading cookies/headers/searchParams sits behind `<Suspense>`; middleware is `src/proxy.ts`.
- **UI**: shadcn/ui components in `src/components/ui` (add with `npx shadcn@latest add <name>`), Tailwind v4 tokens in `src/app/globals.css`, animations with `motion/react`. Inside Telegram the theme comes from `--tg-theme-*`.
- **Auth**: Telegram only (Mini App initData or OIDC on the web) → Supabase session. Never trust `initDataUnsafe` or client-sent user ids. See `docs/adr/0004-telegram-auth.md`.
- **Supabase clients**: `lib/supabase/server.ts` (user, RLS) for reads/writes on behalf of a user; `lib/supabase/admin.ts` (secret key) only where RLS must be bypassed, never to serve user data.
- **apps/bot**: thin — opens the Mini App and sends messages; no business logic or DB access. Polling locally, webhook + secret token in production.
- **Checks before committing**: web `npm run lint && npm run typecheck && npm test && npm run build`; bot `uv run ruff check . && uv run ruff format --check . && uv run pytest`.

## Infrastructure

- **Hosting**: web on Vercel, team `rudiks-projects-1924b04c` (project not created yet); bot as a Docker container in webhook mode (host TBD). `docker-compose.prod.yml` self-hosts both.
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
