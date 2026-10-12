from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, MenuButtonWebApp, WebAppInfo

OPEN_APP_TEXT = "Открыть Fit"


def open_app_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text=OPEN_APP_TEXT, web_app=WebAppInfo(url=webapp_url))]]
    )


def menu_button(webapp_url: str) -> MenuButtonWebApp:
    return MenuButtonWebApp(text=OPEN_APP_TEXT, web_app=WebAppInfo(url=webapp_url))
