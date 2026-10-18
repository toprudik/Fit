"""/start and /help in private chats. Replies follow the sender's Telegram language (ADR 0013 note)."""

import logging

from aiogram import Bot, F, Router
from aiogram.enums import ChatType
from aiogram.exceptions import ClientDecodeError, TelegramAPIError
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import MenuButtonDefault, Message

from fit_bot.config import Settings
from fit_bot.keyboards import Source, menu_button, open_app_keyboard, start_param
from fit_bot.texts import CATALOG, DEFAULT_LOCALE, Locale, pick_locale

log = logging.getLogger("fit_bot.handlers")


async def on_start(message: Message, bot: Bot, settings: Settings, command: CommandObject) -> None:
    """/start and /start <payload>: a valid payload goes to the Mini App button as its startapp parameter
    (marketing §5.2), so it opens the screen and keeps the source tag. It is never echoed in the text."""
    await _answer_with_app(message, bot, settings, "bot_start", start_param(command.args))


async def on_help(message: Message, bot: Bot, settings: Settings) -> None:
    await _answer_with_app(message, bot, settings, "bot_help")


async def _answer_with_app(
    message: Message, bot: Bot, settings: Settings, source: Source, start: str | None = None
) -> None:
    locale = pick_locale(message.from_user.language_code if message.from_user else None)
    texts = CATALOG[locale]
    text = texts.start if source == "bot_start" else texts.help
    # The reply goes first, so a menu-button failure never costs the user the answer.
    await message.answer(text, reply_markup=open_app_keyboard(str(settings.webapp_url), texts, source, start))
    await sync_chat_menu_button(bot, message.chat.id, locale, settings)


async def sync_chat_menu_button(bot: Bot, chat_id: int, locale: Locale, settings: Settings) -> None:
    """Best effort: RU chats follow the default button set by setup, EN chats get the EN button."""
    button = MenuButtonDefault() if locale == DEFAULT_LOCALE else menu_button(str(settings.webapp_url), CATALOG[locale])
    try:
        await bot.set_chat_menu_button(chat_id=chat_id, menu_button=button)
    except (TelegramAPIError, ClientDecodeError) as error:
        log.warning("handlers: could not set the chat menu button (%s)", type(error).__name__)


def build_router() -> Router:
    router = Router(name="commands")
    router.message.filter(F.chat.type == ChatType.PRIVATE)
    router.message.register(on_start, CommandStart())
    router.message.register(on_help, Command("help"))
    return router
