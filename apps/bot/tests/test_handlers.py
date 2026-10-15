import asyncio
import logging
from typing import Any

import pytest
from aiogram.dispatcher.event.bases import UNHANDLED
from aiogram.exceptions import TelegramNetworkError
from aiogram.methods import SendMessage, SetChatMenuButton
from aiogram.types import MenuButtonDefault, MenuButtonWebApp, Update

from fakes import CHAT_ID, RecordingSession, decode_error, make_message_update, make_update, recording_bot
from fit_bot.config import Settings
from fit_bot.dispatcher import build_dispatcher
from fit_bot.texts import CATALOG


def feed(
    settings: Settings, update: dict[str, Any], session: RecordingSession | None = None
) -> tuple[Any, RecordingSession]:
    session = session if session is not None else RecordingSession()
    bot = recording_bot(session)
    result = asyncio.run(build_dispatcher().feed_update(bot, Update.model_validate(update), settings=settings))
    return result, session


def button_url(message: SendMessage) -> str:
    return message.reply_markup.inline_keyboard[0][0].web_app.url  # type: ignore[union-attr]


def test_start_ru(settings: Settings) -> None:
    _, session = feed(settings, make_update("/start"))
    assert session.names() == ["SendMessage", "SetChatMenuButton"]
    sent, menu = session.requests
    assert isinstance(sent, SendMessage) and isinstance(menu, SetChatMenuButton)
    assert sent.chat_id == CHAT_ID
    assert sent.text == CATALOG["ru"].start
    assert sent.reply_markup.inline_keyboard[0][0].text == "Открыть DaFit"  # type: ignore[union-attr]
    assert button_url(sent) == "https://app.example/?source=bot_start"
    assert menu.chat_id == CHAT_ID
    assert isinstance(menu.menu_button, MenuButtonDefault)


@pytest.mark.parametrize("code", ["en-GB", "en"])
def test_start_en(settings: Settings, code: str) -> None:
    _, session = feed(settings, make_update("/start", language_code=code))
    sent, menu = session.requests
    assert sent.text == CATALOG["en"].start
    assert sent.reply_markup.inline_keyboard[0][0].text == "Open DaFit"
    assert button_url(sent) == "https://app.example/?source=bot_start"
    assert menu.chat_id == CHAT_ID
    assert isinstance(menu.menu_button, MenuButtonWebApp)
    assert menu.menu_button.text == "Open DaFit"
    assert menu.menu_button.web_app.url == "https://app.example/?source=bot_menu"


def test_start_without_language_is_ru(settings: Settings) -> None:
    _, session = feed(settings, make_update("/start", language_code=None))
    assert session.requests[0].text == CATALOG["ru"].start


def test_start_payload_is_ignored(settings: Settings) -> None:
    _, session = feed(settings, make_update("/start ti_abc"))
    assert session.names() == ["SendMessage", "SetChatMenuButton"]
    sent = session.requests[0]
    assert sent.text == CATALOG["ru"].start
    assert "ti_abc" not in repr(sent)
    assert "ti_abc" not in repr(session.requests[1])


@pytest.mark.parametrize(("code", "locale"), [("ru", "ru"), ("en-US", "en")])
def test_help(settings: Settings, code: str, locale: str) -> None:
    _, session = feed(settings, make_update("/help", language_code=code))
    assert session.names() == ["SendMessage", "SetChatMenuButton"]
    sent, menu = session.requests
    assert sent.text == CATALOG[locale].help  # type: ignore[index]
    assert button_url(sent) == "https://app.example/?source=bot_help"
    assert isinstance(menu.menu_button, MenuButtonDefault if locale == "ru" else MenuButtonWebApp)


@pytest.mark.parametrize(("text", "code", "locale"), [("hello", "ru", "ru"), ("/foo", "en", "en"), ("?", "uk", "ru")])
def test_fallback(settings: Settings, text: str, code: str, locale: str) -> None:
    _, session = feed(settings, make_update(text, language_code=code))
    assert session.names() == ["SendMessage"]  # no menu-button call
    sent = session.requests[0]
    assert sent.text == CATALOG[locale].fallback  # type: ignore[index]
    assert button_url(sent) == "https://app.example/?source=bot_reply"


@pytest.mark.parametrize(
    "fields",
    [
        {
            "sticker": {
                "file_id": "f",
                "file_unique_id": "u",
                "type": "regular",
                "width": 512,
                "height": 512,
                "is_animated": False,
                "is_video": False,
            }
        },
        {"write_access_allowed": {"from_request": True}},
        {"contact": {"phone_number": "+10000000000", "first_name": "Zelda", "user_id": CHAT_ID}},
    ],
    ids=["sticker", "write_access_allowed", "contact"],
)
def test_non_text_messages_get_no_reply(settings: Settings, fields: dict[str, Any]) -> None:
    result, session = feed(settings, make_message_update(fields))
    assert result is UNHANDLED
    assert session.requests == []


@pytest.mark.parametrize("text", ["/start", "/help", "hello"])
def test_group_chats_get_no_reply(settings: Settings, text: str) -> None:
    result, session = feed(settings, make_update(text, chat_type="group"))
    assert result is UNHANDLED
    assert session.requests == []


@pytest.mark.parametrize(
    "error", [TelegramNetworkError(method=SetChatMenuButton(), message="boom"), decode_error(True)]
)
def test_menu_button_failure_keeps_the_reply(
    settings: Settings, caplog: pytest.LogCaptureFixture, error: Exception
) -> None:
    caplog.set_level(logging.DEBUG)
    session = RecordingSession(fail_on={SetChatMenuButton: error})
    result, session = feed(settings, make_update("/start", language_code="en"), session)
    assert result is not UNHANDLED
    assert session.names() == ["SendMessage", "SetChatMenuButton"]
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert [r.getMessage() for r in warnings] == [
        f"handlers: could not set the chat menu button ({type(error).__name__})"
    ]


def test_used_update_types() -> None:
    assert build_dispatcher().resolve_used_update_types() == ["message"]


def test_dispatcher_can_be_built_twice() -> None:
    assert build_dispatcher() is not build_dispatcher()
