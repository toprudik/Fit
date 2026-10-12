from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from fit_bot.config import Settings
from fit_bot.keyboards import open_app_keyboard

router = Router(name="start")

WELCOME = "Привет! Это Fit. Открой приложение кнопкой ниже — вход через Telegram произойдёт автоматически."


@router.message(CommandStart())
async def on_start(message: Message, settings: Settings) -> None:
    await message.answer(WELCOME, reply_markup=open_app_keyboard(str(settings.webapp_url)))
