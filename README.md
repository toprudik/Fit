# DaFit

Working name DaFit (repo `fit`). Web app + Telegram Mini App + Telegram bot [@fitconnection_bot](https://t.me/fitconnection_bot).
Sign-in with Telegram only; backend on Supabase.

```
apps/web     Next.js 16 · Tailwind v4 · shadcn/ui · motion · Telegram Mini App SDK
apps/bot     Python 3.13 · aiogram 3
supabase/    SQL migrations and pgTAP tests
docs/adr/    Architecture decisions
```

## Run locally (Docker)

1. `cp .env.example .env.local` and fill in the empty values (see comments in the file).
2. `docker compose up --build` → web on http://localhost:3000, bot in polling mode.

### Open the Mini App inside Telegram

Telegram needs a public HTTPS URL:

1. `docker compose --profile tunnel up` and copy the `https://….trycloudflare.com` URL from the `tunnel` logs.
2. In `.env.local` set `NEXT_PUBLIC_APP_URL` and `WEBAPP_URL` to that URL; restart (`docker compose up`).
3. Send `/start` to the bot and press **Открыть Fit**.

### Website login with Telegram

In @BotFather → your bot → **Login Widget**: add the site origin and `<origin>/auth/telegram/callback`
to Allowed URLs, then put the shown Client ID / Client Secret into `.env.local`.

## Deployed environments

Web on Vercel; the bot runs serverless on Vercel in webhook mode, and notifications are sent from a database outbox processed by Supabase pg_cron (ADR 0006). Docker is for local development; `docker-compose.prod.yml` is the post-beta self-hosting option.

## Checks

```bash
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
cd apps/web && npm run e2e   # after build: Playwright + axe, phone and desktop, both themes
cd apps/bot && uv run ruff check . && uv run pytest
```

CI runs the same plus the database checks below, a gitleaks secret scan and Docker image builds.

### Database

The schema lives in `supabase/migrations/` and its tests in `supabase/tests/` (pgTAP: RLS, column grants, triggers, constraints). You need Docker and Supabase CLI 2.121.0, the version CI pins. Run from the repo root:

```bash
supabase db start      # local Postgres 17, every migration applied from scratch
supabase test db       # all pgTAP tests
supabase db lint --local --schema public,private --fail-on error   # plpgsql_check
supabase db advisors --local --type all --fail-on warn            # security and performance advisors
supabase gen types typescript --local > apps/web/src/lib/supabase/database.types.ts
supabase stop          # when done
```

After you add or edit a migration, `supabase db reset` rebuilds the database from all migrations. Commit the regenerated `database.types.ts` as the CLI wrote it, without reformatting: CI fails when it differs from the schema.

Migrations reach the hosted project `fit` only through `main`: when a push to `main` changes `supabase/migrations/`, the workflow `Database deploy` runs `supabase db push` and the advisors against it (it can also be started by hand). It reads one repository secret, `SUPABASE_DB_URL`: the Session pooler connection string from the Supabase dashboard (Connect), with the password percent-encoded. Never edit the hosted schema by hand.

## Docs

- `CLAUDE.md`: rules for coding agents
- `docs/decisions.md`: product decisions; `CONTEXT.md`: domain glossary
- `docs/prd/`: what to build per wave; `docs/architecture/`: data model and screens; `docs/plan.md`: plan to the 24.11.2026 beta
- `docs/adr/`: architectural decisions
- `docs/design.md`: design system and key-screen mockups (links), design decisions; `docs/design/`: token snapshot and fonts
- `docs/writing.md`: how DaFit texts are written and proofread (UI copy, bot, docs)
