# DaFit

Working name DaFit (repo `fit`). Web app + Telegram Mini App (`apps/web`, Next.js) and Telegram bot (`apps/bot`, aiogram). Stack and layout: `docs/adr/0003-stack-and-runtime.md`. Run locally with `docker compose up` (see README).

## Read before building a feature

- `docs/decisions.md` — product decisions (source of truth); `CONTEXT.md` — domain glossary, use its terms in code and copy.
- `docs/prd/` — what to build per wave + `quality.md` (Definition of Done); `docs/architecture/data-model.md` (schema, ledger, RLS) and `screens.md` (routes, app shell).
- `docs/adr/` — architectural decisions; don't contradict an ADR silently.
- `docs/plan.md` — delivery plan to the 24.11.2026 beta.
- `docs/design.md` — design system and mockups; follow its rules (voice, color roles, selection = inverse, Da-moment) when building UI.

## Working in this repo

- **apps/web**: Next.js 16 differs from older versions — read `apps/web/AGENTS.md` and the bundled docs in `apps/web/node_modules/next/dist/docs/` before writing Next.js code. Cache Components are on: anything reading cookies/headers/searchParams sits behind `<Suspense>`; middleware is `src/proxy.ts`.
- **UI**: shadcn/ui components in `src/components/ui` (add with `npx shadcn@latest add <name>`), Tailwind v4 tokens in `src/app/globals.css`, animations with `motion/react`. DaFit's own brand theme everywhere, inside Telegram too (only light/dark comes from Telegram) — ADR 0010. Design system, mockups and token snapshot: `docs/design.md` (token names in `docs/design/tokens.json` are the contract for CSS variables).
- **Auth**: Telegram only (Mini App initData or OIDC on the web) → Supabase session. Never trust `initDataUnsafe` or client-sent user ids. See `docs/adr/0004-telegram-auth.md`.
- **Supabase clients**: `lib/supabase/server.ts` (user, RLS) for reads/writes on behalf of a user; `lib/supabase/admin.ts` (secret key) only where RLS must be bypassed, never to serve user data.
- **apps/bot**: thin — answers commands and opens the Mini App; no business logic. Outgoing notifications are sent from the notification outbox, not by bot code (ADR 0006). Polling locally, webhook + secret token when deployed.
- **Checks before committing**: web `npm run lint && npm run typecheck && npm test && npm run build`; bot `uv run ruff check . && uv run ruff format --check . && uv run pytest`.

## Infrastructure

- **Hosting**: web on Vercel, team `rudiks-projects-1924b04c` (project not created yet); bot serverless on Vercel in webhook mode; notifications via a DB outbox processed by pg_cron (ADR 0006). `docker-compose.prod.yml` is the post-beta self-hosting path.
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
