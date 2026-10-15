"""Any other text in a private chat, unknown commands included. Non-text messages get no reply."""

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.types import Message

from fit_bot.config import Settings
from fit_bot.keyboards import open_app_keyboard
from fit_bot.texts import texts_for


async def on_text(message: Message, settings: Settings) -> None:
    texts = texts_for(message.from_user.language_code if message.from_user else None)
    await message.answer(texts.fallback, reply_markup=open_app_keyboard(str(settings.webapp_url), texts, "bot_reply"))


def build_router() -> Router:
    router = Router(name="fallback")
    router.message.filter(F.chat.type == ChatType.PRIVATE)
    router.message.register(on_text, F.text)
    return router
