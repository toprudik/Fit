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

Local runs need your own dev bot: create one in @BotFather (`/newbot`) and put its token into `.env.local`, for the web and the bot alike. Never use @fitconnection_bot locally: the bot container refuses to start with it, or with any bot that has a webhook (ADR 0002 §5). If your dev bot has a webhook, for example after you ran `docker-compose.prod.yml` with it, open `https://api.telegram.org/bot<dev bot token>/deleteWebhook` in a browser to remove it, or create another dev bot.

1. `cp .env.example .env.local` and fill in the empty values (see comments in the file).
2. `docker compose up --build` → web on http://localhost:3000, bot in polling mode.

### Open the Mini App inside Telegram

Telegram needs a public HTTPS URL:

1. `docker compose --profile tunnel up` and copy the `https://….trycloudflare.com` URL from the `tunnel` logs.
2. In `.env.local` set `NEXT_PUBLIC_APP_URL` and `WEBAPP_URL` to that URL; restart (`docker compose up`).
3. Send `/start` to your dev bot and press **Открыть DaFit** (**Open DaFit** if your Telegram is in English).

### Website login with Telegram

In @BotFather → your bot → **Login Widget**: add the site origin and `<origin>/auth/telegram/callback`
to Allowed URLs, then put the shown Client ID / Client Secret into `.env.local`.

## Deployed environments

The web app is the Vercel project `dafit-web` (https://dafit-web-eight.vercel.app). The bot is the Vercel project `dafit-bot` with Root Directory `apps/bot`: a Python function in webhook mode (ADR 0006). Both deploy production from `main`. Previews sit behind Vercel Authentication, so Telegram only reaches production domains. Notifications go out from a database outbox: Supabase pg_cron calls the web route `POST /api/cron/notifications` every minute when messages are due (ADR 0006). Docker is for local development; `docker-compose.prod.yml` is the self-hosting option for after the beta.

### Bot

The bot function has two routes. `GET /healthz` shows whether its settings are valid, the commit it runs, its Vercel environment and the bot's public id (`bot_id`). `POST /telegram/webhook` takes updates from Telegram and checks the secret header before it reads the update.

In Vercel, `dafit-bot` Production has `TELEGRAM_BOT_TOKEN` (@fitconnection_bot, the same token as `dafit-web` Production) and `WEBAPP_URL`. Preview and Development have no Telegram variables, so a preview never talks to Telegram; the `/healthz` of a deployment without a token shows `"bot_id": null`. The webhook secret is derived from the token. `TELEGRAM_WEBHOOK_SECRET` overrides it, and then it belongs next to the token in `dafit-bot` Production and in the repository secrets.

The workflow `Bot setup` registers the webhook `https://<bot domain>/telegram/webhook` and syncs the bot's commands, descriptions, name and menu button. Before it writes anything, it checks that the token belongs to @fitconnection_bot and that the deployed function holds the same bot's token and accepts the secret. It runs after each push to `main` that changes `apps/bot`, once Vercel serves that commit, and checks the bot every morning. It needs one repository secret, `TELEGRAM_BOT_TOKEN`, and also reads `TELEGRAM_WEBHOOK_SECRET` when you set the override; the bot and web URLs are written in the workflow. Start it by hand with mode `setup` after you change the token, or with mode `check` to only look. Its log shows the webhook URL, pending updates and the last delivery error, never a secret. Vercel deployments never register webhooks themselves. If GitHub emails you that `Bot setup` failed, forward the email to Claude.

#### First setup

Once, after the bot code is on `main`:

1. Get the token of @fitconnection_bot: @BotFather → `/mybots` → @fitconnection_bot → API Token. Copy it and do not revoke it.
2. In the Vercel team that holds `dafit-web`: Add New → Project → import `toprudik/Fit`. Project Name `dafit-bot`, Framework Preset Python (if Vercel did not pick it), Root Directory `apps/bot`. Leave the build settings and environment variables empty and deploy. This first build works, but the bot has no settings yet.
3. In `dafit-bot` → Settings → Environment Variables, tick Automatically expose System Environment Variables if it is off. Add `TELEGRAM_BOT_TOKEN` with the token, only Production ticked and Sensitive on. Add `WEBAPP_URL` with `https://dafit-web-eight.vercel.app`, also Production only. Do not add `TELEGRAM_WEBHOOK_SECRET`.
4. Deployments → the latest Production deployment → ⋯ → Redeploy. Leave Deployment Protection as it is.
5. If the production domain of `dafit-bot` is not `https://dafit-bot.vercel.app`, tell Claude, who changes `BOT_WEBHOOK_URL` in `.github/workflows/bot-setup.yml`.
6. In GitHub, `toprudik/Fit` → Settings → Secrets and variables → Actions → New repository secret: `TELEGRAM_BOT_TOKEN`, the same token.
7. Run `Bot setup` with mode `setup` (Actions → Bot setup → Run workflow) and read its log.
8. In @BotFather → `/mybots` → @fitconnection_bot: Bot Settings → Configure Mini App, turn it on and send `https://dafit-web-eight.vercel.app` without `?source`, so `t.me/fitconnection_bot?startapp=…` links work. Then Edit Bot → Edit Botpic and send the PNG that Claude gives you (`docs/design/assets/Brand/app-icon.svg` at 640 px). BotFather accepts the avatar only as a photo, so the SVG file itself does not work.
9. On a phone, send `/start` to @fitconnection_bot. The answer comes in your Telegram language with an **Открыть DaFit** (**Open DaFit**) button that opens DaFit and signs you in. `/help` and any text get an answer with the same button; a sticker gets none.

#### Rotating secrets

To rotate the bot token, revoke the token of @fitconnection_bot in @BotFather. Put the new one into `dafit-web` Production, `dafit-bot` Production and the repository secret `TELEGRAM_BOT_TOKEN`, redeploy both Vercel projects and run `Bot setup`. Until then the bot does not answer, and Telegram keeps the updates for up to 24 hours. The webhook secret changes with the token.

To rotate only the webhook secret, set `TELEGRAM_WEBHOOK_SECRET` (16 to 256 letters, digits, `_` or `-`) in `dafit-bot` Production and as a repository secret, redeploy `dafit-bot` and run `Bot setup`.

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

Migrations reach the hosted project `fit` only through `main`: when a push to `main` changes `supabase/migrations/`, the workflow `Database deploy` runs `supabase db push` and the advisors against it (it can also be started by hand). It reads one repository secret, `SUPABASE_DB_URL`: the Session pooler connection string from the Supabase dashboard (Connect), with the password percent-encoded. Never edit the hosted schema by hand.

## Docs

- `CLAUDE.md`: rules for coding agents
- `docs/decisions.md`: product decisions; `CONTEXT.md`: domain glossary
- `docs/prd/`: what to build per wave; `docs/architecture/`: data model and screens; `docs/plan.md`: plan to the 24.11.2026 beta
- `docs/adr/`: architectural decisions
- `docs/design.md`: design system and key-screen mockups (links), design decisions; `docs/design/`: token snapshot and fonts
- `docs/writing.md`: how DaFit texts are written and proofread (UI copy, bot, docs)
