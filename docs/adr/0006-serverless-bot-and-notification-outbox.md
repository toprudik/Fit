# 6. Bot runs serverless; notifications go through a database outbox

- Status: accepted; supersedes the "bot runs as a Docker container" part of ADR 0003
- Date: 2026-10-13

The beta must cost nothing, and long-running bot hosts are not free. So in deployed environments the aiogram bot runs as a **Python serverless function on Vercel in webhook mode** (aiogram feeds each update from the request; the `X-Telegram-Bot-Api-Secret-Token` check stays). Docker (`docker compose`) remains the local development environment, where the bot uses polling. `docker-compose.prod.yml` stays as the self-hosting path for after the beta.

Because there is no always-on process, **all outgoing messages (notifications, reminders, morning summaries) are rows in a notification outbox table** written by the web app / database. Supabase `pg_cron` + `pg_net` call a protected web route every minute (Vercel Hobby cron is daily-only), which sends due messages via the Bot API idempotently and records the result. The bot itself stays thin: it answers commands and opens the Mini App; it holds no business logic.

Quiet hours: non-urgent messages wait until quiet hours end; session reminders are still sent but silently (`disable_notification`).
