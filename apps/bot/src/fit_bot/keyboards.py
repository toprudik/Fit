"""Buttons that open the Mini App. Every URL carries ?source=<tag> from a closed list (wave-1 §1, NOTIF-8)."""

import typing
from typing import Final, Literal
from urllib.parse import urlencode, urlsplit, urlunsplit

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, MenuButtonWebApp, WebAppInfo

from fit_bot.texts import Texts

Source = Literal["bot_start", "bot_help", "bot_reply", "bot_menu"]
SOURCES: Final[tuple[Source, ...]] = typing.get_args(Source)


def app_url(webapp_url: str, source: Source) -> str:
    """WEBAPP_URL with path "/" (or its own path) and ?source=<tag>; no locale in the URL (ADR 0015)."""
    if source not in SOURCES:
        raise ValueError(f"unknown source tag {source!r}")
    parts = urlsplit(webapp_url)
    return urlunsplit(("https", parts.netloc, parts.path or "/", urlencode({"source": source}), ""))


def open_app_keyboard(webapp_url: str, texts: Texts, source: Source) -> InlineKeyboardMarkup:
    button = InlineKeyboardButton(text=texts.open_app_button, web_app=WebAppInfo(url=app_url(webapp_url, source)))
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


def menu_button(webapp_url: str, texts: Texts) -> MenuButtonWebApp:
    return MenuButtonWebApp(text=texts.menu_button, web_app=WebAppInfo(url=app_url(webapp_url, "bot_menu")))
