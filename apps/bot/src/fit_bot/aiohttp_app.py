"""Self-hosted webhook server for docker-compose.prod.yml: one long-lived Bot, the same core as the Vercel app.

Routes: GET /healthz and POST /telegram/webhook; everything else gets aiohttp's own 404/405, bodies over 1 MiB its 413.
On startup it registers the webhook and syncs the bot profile (shared with `python -m fit_bot setup`).
"""

import logging

from aiogram import Bot, Dispatcher
from aiohttp import web

from fit_bot.bot_setup import register_webhook, sync_profile
from fit_bot.config import HEALTH_PATH, WEBHOOK_PATH, Settings, deployment_commit, token_bot_id, vercel_env
from fit_bot.dispatcher import build_dispatcher
from fit_bot.webhook import (
    MAX_BODY_BYTES,
    SECRET_HEADER,
    expected_secret,
    header_value,
    make_bot,
    parse_update,
    process_update,
    secret_matches,
)

log = logging.getLogger("fit_bot.webhook")

_NO_STORE = {"Cache-Control": "no-store"}


def create_aiohttp_app(
    settings: Settings,
    *,
    bot: Bot | None = None,
    dispatcher: Dispatcher | None = None,
    configure_on_startup: bool = True,
) -> web.Application:
    dp = dispatcher if dispatcher is not None else build_dispatcher()
    the_bot = bot if bot is not None else make_bot(settings)
    secret = expected_secret(settings)

    async def health(_: web.Request) -> web.Response:
        payload = {"configured": True, "commit": deployment_commit(), "env": vercel_env(), "bot_id": token_bot_id()}
        return web.json_response(payload, headers=_NO_STORE)

    async def webhook(request: web.Request) -> web.Response:
        if not secret_matches(header_value(request.raw_headers, SECRET_HEADER), secret):
            log.warning("webhook: rejected a request with a wrong or missing secret token")
            return web.Response(status=401, headers=_NO_STORE)
        try:
            body = await request.read()
        except web.HTTPRequestEntityTooLarge:
            log.warning("webhook: rejected a request body over %d bytes", MAX_BODY_BYTES)
            raise
        update = parse_update(body)
        if update is None:
            return _json_ok()
        outcome = await process_update(dp, the_bot, update, settings=settings)
        if outcome.status == 200:
            return _json_ok()
        headers = {**_NO_STORE, **{name.decode(): value.decode() for name, value in outcome.headers}}
        return web.Response(status=outcome.status, headers=headers)

    async def configure(_: web.Application) -> None:
        step = await register_webhook(the_bot, dp, settings)
        if step.failed:
            raise RuntimeError(f"could not register the webhook: {step.detail}")
        log.info("webhook registered: %s", step.detail)
        for profile_step in await sync_profile(the_bot, settings, set_name=True):
            if profile_step.failed or profile_step.status == "postponed":
                log.warning("setup: %s %s %s", profile_step.name, profile_step.status, profile_step.detail)

    async def close_bot(_: web.Application) -> None:
        await the_bot.session.close()

    app = web.Application(client_max_size=MAX_BODY_BYTES)
    app.router.add_get(HEALTH_PATH, health)
    app.router.add_post(WEBHOOK_PATH, webhook)
    if configure_on_startup:
        app.on_startup.append(configure)
    app.on_cleanup.append(close_bot)
    return app


def run_webhook_server(settings: Settings) -> None:
    app = create_aiohttp_app(settings)
    log.info("starting the webhook server on port %d", settings.port)
    web.run_app(app, host="0.0.0.0", port=settings.port, print=None)  # noqa: S104 (inside the container)


def _json_ok() -> web.Response:
    return web.Response(status=200, body=b"{}", content_type="application/json", headers=_NO_STORE)
