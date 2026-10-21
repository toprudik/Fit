<div align="center">

<img src="docs/design/assets/Brand/app-icon.svg" width="96" height="96" alt="DaFit">

# DaFit

**An app for personal trainers and their clients**

Schedule, passes, workouts, nutrition and progress in one place: in the browser and right inside Telegram.

[Русский](README.md) · **English**

[![CI](https://github.com/toprudik/Fit/actions/workflows/ci.yml/badge.svg)](https://github.com/toprudik/Fit/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_17-3ECF8E?logo=supabase&logoColor=white)
![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini_App-26A5E4?logo=telegram&logoColor=white)
![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)

[Open DaFit](https://dafit-web-eight.vercel.app) · [Bot @fitconnection_bot](https://t.me/fitconnection_bot)

</div>

## What it is

Trainers usually keep their clients in a notebook, a spreadsheet and a pile of chats: who comes when, who owes what, how everyone is progressing. DaFit puts all of that into one app that both the trainer and the clients use.

The trainer runs their clients in DaFit. The client sees their sessions, passes and progress, and decides which of their data the trainer may see. One person can be a trainer and a client at once: the app has two zones, "Trainer" and "Client", and you switch between them. Sign-in is Telegram only.

DaFit is getting ready for a closed beta that starts on 24 November 2026. The name is a working one, and the repository is called `fit`.

## Features

**For trainers**

- Schedule: slots, recurring sessions, a week template, group sessions, offline and online, bookings and requests, cancellations and reschedules, calendar sync.
- Passes and payments: packages, price grid, debt, freezes, single sessions.
- Clients: client cards, notes, the client intake form, and cards for people who haven't joined DaFit yet (they move to the person with their history later).
- A public trainer page with a QR code, a client link and a trial session link.
- Analytics and finances, groups and broadcasts, assistants and substitutes.

**For clients**

- Your sessions, passes and reminders from the bot.
- A workout log with exercises from wger, templates and personal records.
- Nutrition: daily target, food diary, search by Open Food Facts and barcode.
- Progress: measurements, before-and-after photos with faces blurred on the device, steps, water and sleep.
- Streaks, badges, challenges and a monthly summary with story cards.

**Privacy**

- Everything personal lives inside the pair of a trainer and a client. A trainer sees only their own clients, and only what each client has shared.
- Admins don't see clients' personal data.
- Export of your data and account deletion are built into the app.

## Built with

| Part | Stack |
|---|---|
| Web and Telegram Mini App (`apps/web`) | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, motion |
| Bot (`apps/bot`) | Python 3.13, aiogram 3, runs on a webhook |
| Database and auth | Supabase: Postgres with RLS, migrations and pgTAP tests; Telegram sign-in |
| Hosting | Vercel (web and bot); notifications go out from a database outbox via pg_cron |

More on the stack: [ADR 0003](docs/adr/0003-stack-and-runtime.md).

## Repository layout

```
apps/web/     web app and Telegram Mini App (Next.js)
apps/bot/     Telegram bot (aiogram)
supabase/     SQL migrations and pgTAP tests
docs/         decisions, PRDs, architecture, design, ADRs
scripts/      helper scripts for CI and development
```

## Run locally

You need Docker and your own dev bot. Create one in @BotFather (`/newbot`) and put its token into `.env.local`, for the web and the bot alike. Never use @fitconnection_bot locally: the bot container refuses to start with it, or with any bot that has a webhook (ADR 0002 §5). If your dev bot has a webhook, for example after you ran `docker-compose.prod.yml` with it, open `https://api.telegram.org/bot<dev bot token>/deleteWebhook` in a browser to remove it, or create another dev bot.

1. `cp .env.example .env.local` and fill in the empty values (see the comments in the file).
2. `docker compose up --build`: the web app runs on http://localhost:3000, the bot in polling mode.

### Open the Mini App inside Telegram

Telegram needs a public HTTPS URL:

1. `docker compose --profile tunnel up` and copy the `https://….trycloudflare.com` URL from the `tunnel` logs.
2. In `.env.local` set `NEXT_PUBLIC_APP_URL` and `WEBAPP_URL` to that URL and restart (`docker compose up`).
3. Send `/start` to your dev bot and press **Открыть DaFit** (**Open DaFit** if your Telegram is in English).

### Website login with Telegram

In @BotFather → your bot → **Login Widget**, add the site origin and `<origin>/auth/telegram/callback` to Allowed URLs, then put the Client ID and Client Secret it shows into `.env.local`.

## Checks

```bash
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
cd apps/web && npm run e2e   # after build: Playwright + axe, phone and desktop, both themes
cd apps/bot && uv run ruff check . && uv run ruff format --check . && uv run pytest
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

Migrations reach the hosted Supabase project only through `main`: when a push to `main` changes `supabase/migrations/`, the workflow `Database deploy` runs `supabase db push` and the advisors against it. It takes the connection string from the secret `SUPABASE_DB_URL` in the environment `supabase-fit`. Nightly encrypted copies of the database are made by the separate private repository `fit-backups`, which calls the workflow `db-backup.yml` from here on a schedule. Never edit the hosted schema by hand.

## Deployment

The web app and the bot run on Vercel and deploy to production from `main` only. How the environments work, how to set the bot up from scratch and how to rotate secrets: [docs/deployment.md](docs/deployment.md).

## Docs

- [CLAUDE.md](CLAUDE.md): rules for coding agents
- [docs/decisions.md](docs/decisions.md): product decisions; [CONTEXT.md](CONTEXT.md): domain glossary
- [docs/prd/](docs/prd/): what to build per wave; [docs/architecture/](docs/architecture/): data model and screens; [docs/plan.md](docs/plan.md): plan to the 24.11.2026 beta
- [docs/adr/](docs/adr/): architectural decisions
- [docs/design.md](docs/design.md): design system and mockups; [docs/design/](docs/design/): tokens and fonts
- [docs/writing.md](docs/writing.md): how DaFit texts are written and proofread

Most project docs are in Russian.
