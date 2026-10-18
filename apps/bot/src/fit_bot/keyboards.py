"""Buttons that open the Mini App. Every URL carries ?source=<tag> from a closed list (wave-1 §1, NOTIF-8)."""

import re
import typing
from typing import Final, Literal
from urllib.parse import urlencode, urlsplit, urlunsplit

from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, MenuButtonWebApp, WebAppInfo

from fit_bot.texts import Texts

Source = Literal["bot_start", "bot_help", "bot_reply", "bot_menu"]
SOURCES: Final[tuple[Source, ...]] = typing.get_args(Source)

#: What Telegram allows in startapp (screens.md §1.7); anything else is dropped, never passed on.
START_PARAM_RE: Final = re.compile(r"[A-Za-z0-9_-]{1,512}")


def start_param(payload: str | None) -> str | None:
    """The /start payload when it is a valid startapp parameter, else None."""
    return payload if payload and START_PARAM_RE.fullmatch(payload) else None


def app_url(webapp_url: str, source: Source, start: str | None = None) -> str:
    """WEBAPP_URL with path "/" (or its own path) and ?source=<tag>; no locale in the URL (ADR 0015).

    `start` goes in as tgWebAppStartParam: the Mini App reads launch params from the query as well as the
    hash, so a link t.me/<bot>?start=<payload> opens the same screen as t.me/<bot>?startapp=<payload>.
    """
    if source not in SOURCES:
        raise ValueError(f"unknown source tag {source!r}")
    query: dict[str, str] = {"source": source}
    if start is not None:
        if not START_PARAM_RE.fullmatch(start):
            raise ValueError("invalid start parameter")
        query["tgWebAppStartParam"] = start
    parts = urlsplit(webapp_url)
    return urlunsplit(("https", parts.netloc, parts.path or "/", urlencode(query), ""))


def open_app_keyboard(webapp_url: str, texts: Texts, source: Source, start: str | None = None) -> InlineKeyboardMarkup:
    url = app_url(webapp_url, source, start)
    button = InlineKeyboardButton(text=texts.open_app_button, web_app=WebAppInfo(url=url))
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


def menu_button(webapp_url: str, texts: Texts) -> MenuButtonWebApp:
    return MenuButtonWebApp(text=texts.menu_button, web_app=WebAppInfo(url=app_url(webapp_url, "bot_menu")))
