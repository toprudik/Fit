"""Local development: long polling with your own dev bot, never @fitconnection_bot (ADR 0002 §5).

Before any write it checks the bot: the production bot, or any bot with a webhook, is refused. It never deletes a
webhook. Then it syncs the dev bot's commands, descriptions and menu button (not its name) and starts polling.
"""

import logging

from aiogram import Bot

from fit_bot.bot_setup import sync_profile
from fit_bot.config import PRODUCTION_BOT_USERNAME, Settings
from fit_bot.dispatcher import build_dispatcher
from fit_bot.webhook import make_bot

log = logging.getLogger("fit_bot.polling")

_DEV_BOT_HINT = (
    "Local development uses its own dev bot (docs/adr/0002-secrets-handling.md §5): "
    "put that bot's token into .env.local."
)


class PollingRefusedError(RuntimeError):
    """Polling would take updates away from the production bot or from a bot that has a webhook."""


async def ensure_safe_to_poll(bot: Bot) -> None:
    me = await bot.get_me()
    if (me.username or "").lower() == PRODUCTION_BOT_USERNAME:
        raise PollingRefusedError(f"This is the production bot @{PRODUCTION_BOT_USERNAME}. {_DEV_BOT_HINT}")
    info = await bot.get_webhook_info()
    if info.url:
        raise PollingRefusedError(f"This bot has a webhook, so polling would take its updates away. {_DEV_BOT_HINT}")


async def run_polling(settings: Settings) -> None:
    bot = make_bot(settings)
    dp = build_dispatcher()
    try:
        await ensure_safe_to_poll(bot)  # before any write; no delete_webhook anywhere
        for step in await sync_profile(bot, settings, set_name=False):
            if step.failed or step.status == "postponed":
                log.warning("profile: %s %s %s", step.name, step.status, step.detail)
        log.info("starting in polling mode")
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types(), settings=settings)
    finally:
        await bot.session.close()
