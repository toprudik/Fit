"""`python -m fit_bot [run]`: the bot in the mode BOT_MODE names (Docker). `python -m fit_bot setup`: webhook and
profile setup (workflow "Bot setup"). Exit codes: 0 success, 1 setup checks failed, 2 invalid settings or polling
refused."""

import argparse
import asyncio
import logging
import sys
from collections.abc import Sequence

from fit_bot.bot_setup import run_setup
from fit_bot.config import PRODUCTION_BOT_USERNAME, SettingsError, load_settings
from fit_bot.polling import PollingRefusedError, run_polling

log = logging.getLogger("fit_bot")

_LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m fit_bot", description="DaFit Telegram bot")
    commands = parser.add_subparsers(dest="command")
    commands.add_parser("run", help="run the bot in the mode BOT_MODE names (default)")
    setup = commands.add_parser("setup", help="register the webhook and sync the bot profile")
    setup.add_argument("--check-only", action="store_true", help="only read and probe, change nothing")
    setup.add_argument(
        "--bot-username",
        default=PRODUCTION_BOT_USERNAME,
        help=f"the bot the token must belong to (default @{PRODUCTION_BOT_USERNAME})",
    )
    args = parser.parse_args(argv)
    if args.command == "setup":
        return _setup(check_only=args.check_only, bot_username=args.bot_username)
    return _run()


def _run() -> int:
    logging.basicConfig(level=logging.INFO, format=_LOG_FORMAT)
    try:
        settings = load_settings()
        if settings.bot_mode == "webhook":
            settings = load_settings(require={"bot_webhook_url"})
    except SettingsError as error:
        log.error("%s", error)
        return 2

    if settings.bot_mode == "webhook":
        from fit_bot.aiohttp_app import run_webhook_server

        run_webhook_server(settings)
        return 0
    try:
        asyncio.run(run_polling(settings))
    except PollingRefusedError as error:
        log.error("%s", error)
        return 2
    return 0


def _setup(*, check_only: bool, bot_username: str) -> int:
    logging.basicConfig(level=logging.WARNING, format=_LOG_FORMAT)  # only the report prints
    try:
        settings = load_settings(require={"bot_webhook_url"})
    except SettingsError as error:
        log.error("%s", error)
        return 2
    expected = bot_username.removeprefix("@").lower()
    return asyncio.run(run_setup(settings, check_only=check_only, expected_username=expected))


if __name__ == "__main__":
    sys.exit(main())
