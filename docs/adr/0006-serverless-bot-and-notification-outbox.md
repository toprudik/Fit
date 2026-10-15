# 6. Bot runs serverless; notifications go through a database outbox

- Status: accepted; supersedes the "bot runs as a Docker container" part of ADR 0003
- Date: 2026-10-13

The beta must cost nothing, and long-running bot hosts are not free. So in deployed environments the aiogram bot runs as a **Python serverless function on Vercel in webhook mode** (aiogram feeds each update from the request; the `X-Telegram-Bot-Api-Secret-Token` check stays). Docker (`docker compose`) remains the local development environment, where the bot uses polling. `docker-compose.prod.yml` stays as the self-hosting path for after the beta.

Because there is no always-on process, **all outgoing messages (notifications, reminders, morning summaries) are rows in a notification outbox table** written by the web app / database. Supabase `pg_cron` + `pg_net` call a protected web route every minute (Vercel Hobby cron is daily-only), which sends due messages via the Bot API idempotently and records the result. The bot itself stays thin: it answers commands and opens the Mini App; it holds no business logic.

Quiet hours: non-urgent messages wait until quiet hours end; session reminders are still sent but silently (`disable_notification`).

## Implementation notes (2026-10-15)

- The bot is the Vercel project `dafit-bot` (Root Directory `apps/bot`, Python preset, Python 3.13 from `.python-version`). `api/index.py` exposes the ASGI app `fit_bot.asgi:app`, which Vercel serves with its own uvicorn. The app has two routes: `GET /healthz` and `POST /telegram/webhook`.
- Each request is checked (path, method, secret header), and the update is processed to the end before the function answers. Nothing runs after the answer. Every update gets its own Bot API session, closed after the answer.
- The function answers 200 when an update was handled or can never be handled (unreadable body, a bug in a handler, a user who blocked the bot, a Bot API answer that does not fit the model). It answers 503 with `Retry-After` when the Bot API is briefly unavailable, rate limits the bot or rejects the deployment's token, 401 for a wrong secret and 500 when settings are missing. Telegram retries any answer other than 2xx and holds that chat's later updates until then, so bugs must not return 5xx and configuration faults must.
- `python -m fit_bot setup` sets the webhook, commands, descriptions, name and default menu button. The workflow `Bot setup` runs it on `main` after each production deployment of the bot and on demand. It first checks the bot's username and that the deployed function holds the same bot's token and accepts the secret. Deployments never register webhooks, and the bot's previews have no Telegram variables.
- Locally the bot polls with a separate dev bot and refuses to start with @fitconnection_bot or with a bot that has a webhook. `docker-compose.prod.yml` serves the same handlers through aiohttp and registers its webhook on start.
