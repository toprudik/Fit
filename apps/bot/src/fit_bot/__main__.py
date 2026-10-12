"""Entry point: `python -m fit_bot`. Polling for local dev, webhook (with secret token) for production."""

import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from aiohttp import web

from fit_bot.config import WEBHOOK_PATH, Settings, SettingsError, load_settings
from fit_bot.handlers import build_router
from fit_bot.keyboards import menu_button

log = logging.getLogger("fit_bot")


def build(settings: Settings) -> tuple[Bot, Dispatcher]:
    bot = Bot(settings.telegram_bot_token.get_secret_value(), default=DefaultBotProperties(parse_mode="HTML"))
    dp = Dispatcher(settings=settings)
    dp.include_router(build_router())

    @dp.startup()
    async def _set_menu_button(bot: Bot) -> None:
        await bot.set_chat_menu_button(menu_button=menu_button(str(settings.webapp_url)))

    return bot, dp


async def run_polling(settings: Settings) -> None:
    bot, dp = build(settings)
    await bot.delete_webhook(drop_pending_updates=False)
    log.info("starting in polling mode")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


def run_webhook(settings: Settings) -> None:
    assert settings.bot_webhook_url and settings.telegram_webhook_secret  # guaranteed by Settings validation
    bot, dp = build(settings)
    secret = settings.telegram_webhook_secret.get_secret_value()
    url = str(settings.bot_webhook_url).rstrip("/") + WEBHOOK_PATH

    @dp.startup()
    async def _register_webhook(bot: Bot) -> None:
        await bot.set_webhook(url, secret_token=secret, allowed_updates=dp.resolve_used_update_types())
        log.info("webhook registered")

    app = web.Application()
    app.router.add_get("/healthz", lambda _: web.json_response({"ok": True}))
    # Rejects requests without the matching X-Telegram-Bot-Api-Secret-Token header.
    SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=secret).register(app, path=WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)
    log.info("starting in webhook mode on port %s", settings.port)
    web.run_app(app, host="0.0.0.0", port=settings.port, print=None)  # noqa: S104 — inside container


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        settings = load_settings()
    except SettingsError as error:
        log.error("%s", error)
        sys.exit(2)

    if settings.bot_mode == "webhook":
        run_webhook(settings)
    else:
        asyncio.run(run_polling(settings))


if __name__ == "__main__":
    main()
