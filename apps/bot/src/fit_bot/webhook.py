"""Transport-agnostic webhook core: secret check, update parsing and the error policy (contract section 3).

Logs carry no personal data, update content or secrets: update id, event type, status, exception type and
traceback frames, plus Telegram's own description for Bot API errors. Never str() of other exceptions, never
exc_info: pydantic, aiogram's ClientDecodeError and aiohttp errors embed input values, answers or the token URL.
"""

import hmac
import logging
import traceback
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Final

import pydantic
from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.exceptions import (
    ClientDecodeError,
    TelegramAPIError,
    TelegramForbiddenError,
    TelegramMigrateToChat,
    TelegramNetworkError,
    TelegramNotFound,
    TelegramRetryAfter,
    TelegramServerError,
    TelegramUnauthorizedError,
)
from aiogram.methods import TelegramMethod
from aiogram.types import Update
from aiogram.types.update import UpdateTypeLookupError

from fit_bot.config import Settings

log = logging.getLogger("fit_bot.webhook")

SECRET_HEADER: Final = b"x-telegram-bot-api-secret-token"
MAX_BODY_BYTES: Final = 1_048_576
BOT_API_TIMEOUT: Final = 10.0
TRANSIENT_RETRY_AFTER: Final = 5
CONFIG_RETRY_AFTER: Final = 60
MAX_RETRY_AFTER: Final = 3600


@dataclass(frozen=True, slots=True)
class Outcome:
    status: int
    headers: tuple[tuple[bytes, bytes], ...] = ()


def retry(seconds: int) -> Outcome:
    """503 with Retry-After: Telegram keeps the update and retries it."""
    return Outcome(503, ((b"retry-after", str(seconds).encode()),))


def header_value(headers: Iterable[tuple[bytes, bytes]], name: bytes) -> bytes:
    """The first header with this name (case-insensitive), b"" when missing."""
    name = name.lower()
    for key, value in headers:
        if key.lower() == name:
            return value
    return b""


def expected_secret(settings: Settings) -> bytes:
    return settings.webhook_secret().encode("ascii")


def secret_matches(received: bytes, expected: bytes) -> bool:
    """Constant-time comparison of bytes (a str comparison raises on non-ASCII input). An empty secret never matches."""
    if not expected:
        return False
    return hmac.compare_digest(received, expected)


def parse_update(body: bytes) -> Update | None:
    try:
        return Update.model_validate_json(body)
    except pydantic.ValidationError:
        log.error("webhook: authenticated request with an unreadable update body (%d bytes)", len(body))
        return None


def event_type(update: Update) -> str:
    try:
        return update.event_type
    except UpdateTypeLookupError:
        return "unknown"


def describe_error(error: BaseException) -> str:
    """The exception type, plus Telegram's own description for Bot API errors (e.g. "Bad Request: chat not found").

    Flood control and chat migration are left out: aiogram writes the chat id into their message.
    """
    name = type(error).__name__
    if isinstance(error, TelegramAPIError) and not isinstance(
        error, TelegramNetworkError | TelegramRetryAfter | TelegramMigrateToChat
    ):
        return f"{name}: {error.message}"
    return name


def traceback_frames(error: BaseException) -> str:
    """File, line and code of each frame; no exception message."""
    return "".join(traceback.format_tb(error.__traceback__))


def make_bot(settings: Settings, *, api: TelegramAPIServer | None = None) -> Bot:
    """A Bot with its own aiohttp session (bound to the running loop once used). Plain text, no parse mode."""
    session = (
        AiohttpSession(timeout=BOT_API_TIMEOUT) if api is None else AiohttpSession(api=api, timeout=BOT_API_TIMEOUT)
    )
    return Bot(settings.telegram_bot_token.get_secret_value(), session=session)


async def process_update(dp: Dispatcher, bot: Bot, update: Update, **data: Any) -> Outcome:
    """Handles one update to the end and maps the result to an HTTP outcome. The whole error policy lives here."""
    kind = event_type(update)
    uid = update.update_id
    try:
        # feed_update re-mounts the update on this bot (do not call update.as_ here).
        result = await dp.feed_update(bot, update, **data)
        if isinstance(result, TelegramMethod):
            # A method in the webhook response body fails silently, so it is executed here.
            await bot(result)
    except TelegramRetryAfter as error:
        delay = max(1, min(int(error.retry_after), MAX_RETRY_AFTER))
        log.warning("webhook: flood control on update %d (%s), asked Telegram to retry in %d s", uid, kind, delay)
        return retry(delay)
    except (TelegramNetworkError, TelegramServerError) as error:  # RestartingTelegram is a TelegramServerError
        log.warning(
            "webhook: Bot API unavailable on update %d (%s): %s, asked Telegram to retry in %d s",
            uid,
            kind,
            type(error).__name__,
            TRANSIENT_RETRY_AFTER,
        )
        return retry(TRANSIENT_RETRY_AFTER)
    except (TelegramUnauthorizedError, TelegramNotFound) as error:
        log.error(
            "webhook: the Bot API rejected this deployment's token on update %d (%s): %s, "
            "check TELEGRAM_BOT_TOKEN in Vercel; asked Telegram to retry in %d s",
            uid,
            kind,
            type(error).__name__,
            CONFIG_RETRY_AFTER,
        )
        return retry(CONFIG_RETRY_AFTER)
    except TelegramForbiddenError:
        log.warning("webhook: the user blocked the bot, update %d (%s) dropped", uid, kind)
        return Outcome(200)
    except ClientDecodeError as error:
        original = type(error.original).__name__
        if isinstance(error.original, pydantic.ValidationError):
            # JSON that does not fit aiogram's model: the call probably succeeded and a retry fails the same way.
            log.error(
                "webhook: could not read the Bot API answer on update %d (%s): %s, update dropped", uid, kind, original
            )
            return Outcome(200)
        log.warning(
            "webhook: the Bot API answered with an undecodable body on update %d (%s): %s, "
            "asked Telegram to retry in %d s",
            uid,
            kind,
            original,
            TRANSIENT_RETRY_AFTER,
        )
        return retry(TRANSIENT_RETRY_AFTER)
    except Exception as error:  # a bug, or a deterministic Bot API refusal such as TelegramBadRequest
        log.error(
            "webhook: handler failed on update %d (%s): %s\n%s",
            uid,
            kind,
            describe_error(error),
            traceback_frames(error),
        )
        return Outcome(200)
    return Outcome(200)
