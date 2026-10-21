# Deployment

How the hosted environments are set up and run. Local development is in the [README](../README.en.md).

The web app is the Vercel project `dafit-web` (https://dafit-web-eight.vercel.app). The bot is the Vercel project `dafit-bot` with Root Directory `apps/bot`: a Python function in webhook mode (ADR 0006). Both deploy production from `main`, and only `main`, because the Hobby plan allows 100 builds a day and pushes to PR branches used them up: `apps/web/vercel.json` turns off automatic builds of other branches, and `dafit-bot` has no automatic builds at all. Bot setup calls its Deploy Hook (repository secret `BOT_DEPLOY_HOOK`) after a push to `main` that changes `apps/bot`, so a merge that leaves the bot alone costs one build, not two. CI checks every PR without Vercel. Previews sit behind Vercel Authentication, so Telegram only reaches production domains. Notifications go out from a database outbox: Supabase pg_cron calls the web route `POST /api/cron/notifications` every minute when messages are due (ADR 0006). Docker is for local development; `docker-compose.prod.yml` is the self-hosting option for after the beta.

## Bot

The bot function has two routes. `GET /healthz` shows whether its settings are valid, the commit it runs, its Vercel environment and the bot's public id (`bot_id`). `POST /telegram/webhook` takes updates from Telegram and checks the secret header before it reads the update.

In Vercel, `dafit-bot` Production has `TELEGRAM_BOT_TOKEN` (@fitconnection_bot, the same token as `dafit-web` Production) and `WEBAPP_URL`. Preview and Development have no Telegram variables, so a preview never talks to Telegram; the `/healthz` of a deployment without a token shows `"bot_id": null`. The webhook secret is derived from the token. `TELEGRAM_WEBHOOK_SECRET` overrides it, and then it belongs next to the token in `dafit-bot` Production and in the repository secrets.

The workflow `Bot setup` registers the webhook `https://<bot domain>/telegram/webhook` and syncs the bot's commands, descriptions, name and menu button. Before it writes anything, it checks that the token belongs to @fitconnection_bot and that the deployed function holds the same bot's token and accepts the secret. It runs after each push to `main` that changes `apps/bot`, once Vercel serves that commit, and checks the bot every morning. It needs one repository secret, `TELEGRAM_BOT_TOKEN`, and also reads `TELEGRAM_WEBHOOK_SECRET` when you set the override; the bot and web URLs are written in the workflow. Start it by hand with mode `setup` after you change the token, or with mode `check` to only look. Its log shows the webhook URL, pending updates and the last delivery error, never a secret. Vercel deployments never register webhooks themselves. If GitHub emails you that `Bot setup` failed, forward the email to Claude.

### First setup

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

### Rotating secrets

To rotate the bot token, revoke the token of @fitconnection_bot in @BotFather. Put the new one into `dafit-web` Production, `dafit-bot` Production and the repository secret `TELEGRAM_BOT_TOKEN`, redeploy both Vercel projects and run `Bot setup`. Until then the bot does not answer, and Telegram keeps the updates for up to 24 hours. The webhook secret changes with the token.

To rotate only the webhook secret, set `TELEGRAM_WEBHOOK_SECRET` (16 to 256 letters, digits, `_` or `-`) in `dafit-bot` Production and as a repository secret, redeploy `dafit-bot` and run `Bot setup`.

## Database

Migrations reach the hosted project `fit` only through `main`: when a push to `main` changes `supabase/migrations/`, the workflow `Database deploy` runs `supabase db push` and the advisors against it (it can also be started by hand). It reads one repository secret, `SUPABASE_DB_URL`: the Session pooler connection string from the Supabase dashboard (Connect), with the password percent-encoded. Never edit the hosted schema by hand.
