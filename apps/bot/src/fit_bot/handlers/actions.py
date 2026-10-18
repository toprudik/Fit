"""Buttons that act right in the bot (PRD §3 Т2, Т7a, С1, ADR 0006 "Action buttons").

The bot does not touch the database, so it passes the tap on: the callback data and the tapping user's Telegram id
go to the web route ACTIONS_PATH with a secret derived from the token. The web acts as that user and says what to
show: a popup on the button and, once the request is settled, a line under the message instead of the action
buttons. The bot parses none of the data; apps/web/src/lib/bot-actions/callback-data.ts owns the format.
"""

import html
import logging
import re
from dataclasses import dataclass
from typing import Any, Final

import aiohttp
from aiogram import F, Router
from aiogram.exceptions import ClientDecodeError, TelegramAPIError, TelegramBadRequest
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, LinkPreviewOptions, Message

from fit_bot.config import Settings
from fit_bot.texts import texts_for

log = logging.getLogger("fit_bot.handlers")

#: The prefixes of lib/bot-actions/callback-data.ts: bky/bkn confirm or decline a booking request (Т2), mcy/mcn
#: answer whether the person who came by link is the trainer's card or a new client (Т7a), ctn declines a contact
#: request (С1).
ACTION_DATA: Final = re.compile(r"((bk|mc)[yn]|ctn):")
#: Telegram shows the spinner on the button until the answer; keep the round trip well inside its limit.
WEB_TIMEOUT: Final = 8.0
NOTICE_LIMIT: Final = 200


@dataclass(frozen=True, slots=True)
class ActionAnswer:
    notice: str
    resolved: bool
    line: str | None = None


async def forward_action(settings: Settings, payload: dict[str, Any]) -> ActionAnswer | None:
    """POST to the web; None when it could not answer. Logs carry the status or error type, never the payload."""
    try:
        async with (
            aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=WEB_TIMEOUT)) as http,
            http.post(
                settings.actions_url(),
                json=payload,
                headers={"Authorization": f"Bearer {settings.actions_secret()}"},
                allow_redirects=False,
            ) as response,
        ):
            if response.status != 200:
                log.warning("actions: the web answered %d", response.status)
                return None
            body = await response.json(content_type=None)
    except (aiohttp.ClientError, TimeoutError, ValueError) as error:
        log.warning("actions: could not reach the web (%s)", type(error).__name__)
        return None
    if not isinstance(body, dict):
        return None
    notice, resolved, line = body.get("notice"), body.get("resolved"), body.get("line")
    if not isinstance(notice, str) or not notice or not isinstance(resolved, bool):
        log.warning("actions: the web answered without a notice")
        return None
    return ActionAnswer(notice[:NOTICE_LIMIT], resolved, line if isinstance(line, str) and line else None)


async def on_action(callback: CallbackQuery, settings: Settings) -> None:
    user = callback.from_user
    answer = await forward_action(
        settings, {"telegram_id": user.id, "data": callback.data, "language_code": user.language_code}
    )
    # The popup goes first: it stops the spinner, and a failed edit must not cost the user the answer.
    await _answer(callback, answer.notice if answer else texts_for(user.language_code).action_failed)
    if answer and answer.resolved and isinstance(callback.message, Message):
        await _settle(callback.message, answer.line)


async def on_other(callback: CallbackQuery) -> None:
    """A button this bot no longer knows: just stop the spinner."""
    await _answer(callback, None)


async def _answer(callback: CallbackQuery, text: str | None) -> None:
    try:
        await callback.answer(text)
    except TelegramBadRequest as error:  # e.g. the query is too old: the tap still counts
        log.warning("actions: could not answer the tap (%s)", type(error).__name__)


async def _settle(message: Message, line: str | None) -> None:
    """Keeps the message and its link buttons, drops the action buttons and appends the outcome."""
    rows = [
        [button for button in row if button.callback_data is None]
        for row in (message.reply_markup.inline_keyboard if message.reply_markup else [])
    ]
    rows = [row for row in rows if row]
    text = message.html_text + (f"\n\n{html.escape(line)}" if line else "")
    try:
        await message.edit_text(
            text,
            parse_mode="HTML",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=rows) if rows else None,
            link_preview_options=LinkPreviewOptions(is_disabled=True),
        )
    except (TelegramAPIError, ClientDecodeError) as error:  # the decision stands either way
        log.warning("actions: could not update the message (%s)", type(error).__name__)


def build_router() -> Router:
    router = Router(name="actions")
    router.callback_query.register(on_action, F.data.regexp(ACTION_DATA))
    router.callback_query.register(on_other)
    return router
