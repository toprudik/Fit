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
- `python -m fit_bot setup` sets the webhook, commands, descriptions, name and default menu button. The workflow `Bot setup` runs it on `main` after each production deployment of the bot and on demand. It first checks the bot's username and that the deployed function holds the same bot's token and accepts the secret. Vercel deployments never register webhooks, and the bot's previews have no Telegram variables.
- Locally the bot polls with a separate dev bot and refuses to start with @fitconnection_bot or with a bot that has a webhook. `docker-compose.prod.yml` serves the same handlers through aiohttp and registers its webhook on start.

## Notification dispatch (2026-10-15)

- Producers queue messages with `private.enqueue_notification` in the same transaction as their change. It applies the recipient's quiet hours to `deliver_after` and ignores a repeated `dedupe_key`.
- pg_cron runs `private.dispatch_notifications()` every minute. When rows are due it posts to the web route `POST /api/cron/notifications` through pg_net with `Authorization: Bearer <CRON_SECRET>`. The URL and the secret live in Supabase Vault, so without them (local databases) the job does nothing. A second job deletes sent, skipped and cancelled rows older than 90 days.
- The route (`apps/web`, Node, `maxDuration` 60 s) claims up to 50 rows at a time with `public.claim_outbox` and keeps going for about 40 seconds. It sends one message at a time, at most about 25 a second and one a second per chat, and records each result with `public.record_outbox_result` right after the send. Both functions run only as `service_role`.
- Checks at send time: a card without Telegram, an account blocked by an admin, a user whose bot is marked blocked, an account being deleted (except the deletion and export messages), a type the user turned off, and a reminder whose booking is no longer confirmed or whose session has started are skipped with the reason in `last_error`. A message that must wait for quiet hours and now falls into them moves to their end.
- Quiet hours: session reminders and the `bot_test` message go out on time, silently (`disable_notification`); everything else waits. `bot_test` answers the user's own tap (AUTH-7), so it does not wait until morning.
- Results: 403 or "chat not found" skips the row and sets `profiles.bot_blocked_at`; sign-in clears it, which is the only sign of life the web sees, since the bot does not touch the database. 429 stops the run and hands the rest back without using their attempts. A wrong token does the same. 5xx and network errors retry after 30 s, 1, 2 and 4 minutes, and the fifth failure is final. Any other 400 fails at once. Error codes never contain the token.
- Delivery is at least once. Telegram has no idempotency key, so if a run dies between a send and its record, the row goes out again after its 5-minute lease.
- Texts live in `botMessages` of the web dictionaries, in the recipient's DaFit language. Each type gets its template together with the feature that queues it; a row without a template fails with `no_template`. Buttons are `web_app` buttons to the app route with `?source=<type>`, and plain links in the team group, where Telegram does not allow `web_app`.
- Buttons that act right in the bot (PRD §3 Т2, Т7a, С1) are not part of this; see "Action buttons" below.

## Action buttons (2026-10-17)

Some notifications let the recipient answer without opening the app (PRD §3 Т2: "Подтвердить" and "Отклонить" on a booking request). The bot still does not touch the database, so it passes the tap to the web:

- A template returns such a button as an action; the dispatcher sends it as a `callback_data` button, in private chats only (in a group the tap would act for whoever tapped). The data is short, `<action>:<id>` within Telegram's 64 bytes; `apps/web/src/lib/bot-actions/callback-data.ts` owns the format, and the bot only knows which prefixes to forward.
- The bot posts the data, the tapping user's Telegram id and their Telegram language to `POST /api/bot/actions` on the `WEBAPP_URL` origin with `Authorization: Bearer <secret>`. The secret is `hex(HMAC-SHA256(key=TELEGRAM_BOT_TOKEN, msg="dafit/bot-actions/v1"))`: both projects already hold the token, so there is no new variable, and it rotates with the token like the webhook secret. The Telegram id is trusted because the update came through the webhook with its own secret.
- The web finds the existing, unblocked account of that Telegram id, mints a session the way sign-in does (a one-time magic-link token, never mailed), calls the same RPC the app calls (`decide_booking`) with that session and revokes the session afterwards. RLS and the RPC's own checks decide, so a delegate acts within their scope and anyone else gets "request not found". A tap never creates an account.
- The answer is what the bot shows: a popup on the button in the user's DaFit language and, once the request is settled (decided, or already closed), a line appended to the message in place of the action buttons. Link buttons stay. If the web cannot answer, the bot shows its own "didn't work" popup in the Telegram language and leaves the buttons.
- Т7a ("Это он(а)" / "Новый клиент") uses the same route with `get_managed_client_claim` and `resolve_managed_client_claim`. A merge cannot be undone, so the bot merges only when the trainer has exactly one card without an account and names it in the line; with several cards, or when "new client" would close the pair on a full Free plan, the popup sends the trainer to the app.
- Logs on both sides carry status codes and error types only, never the Telegram id, the data or the booking.

Setup, once per environment:

1. Generate a secret: `openssl rand -hex 32`. Set it as `CRON_SECRET` in Vercel `dafit-web` (Production) and redeploy.
2. In the Supabase SQL editor of the project, as postgres: `select private.configure_notification_dispatch('https://dafit-web-eight.vercel.app/api/cron/notifications', '<the same secret>');`
3. For the team messages, add the bot to the team group and set its id as `TELEGRAM_ADMIN_CHAT_ID`.
4. Check: `select private.enqueue_notification('bot_test', 'bot_test:manual:' || now(), '{}', '<your profiles.id>');` and the message arrives within a minute; `select status, last_error from public.notification_outbox order by id desc limit 5;` shows the result.
