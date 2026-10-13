# DaFit

Working name DaFit (repo `fit`). Web app + Telegram Mini App + Telegram bot [@fitconnection_bot](https://t.me/fitconnection_bot).
Sign-in with Telegram only; backend on Supabase.

```
apps/web     Next.js 16 · Tailwind v4 · shadcn/ui · motion · Telegram Mini App SDK
apps/bot     Python 3.13 · aiogram 3
supabase/    SQL migrations
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
cd apps/bot && uv run ruff check . && uv run pytest
```

CI runs the same plus a gitleaks secret scan and Docker image builds.

## Docs

- `CLAUDE.md` — rules for coding agents
- `docs/decisions.md` — product decisions; `CONTEXT.md` — domain glossary
- `docs/prd/` — what to build per wave; `docs/architecture/` — data model and screens; `docs/plan.md` — plan to the 24.11.2026 beta
- `docs/adr/` — architectural decisions
- `docs/design.md` — design system and key-screen mockups (links), design decisions; `docs/design/` — token snapshot and fonts
