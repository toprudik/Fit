"""Every way a person reaches the bot, end to end: an update arrives at the webhook with Telegram's secret, the real
dispatcher handles it, and the test looks at what the bot asked of the Bot API and of the web.

Action buttons go over real HTTP to a stand-in for POST /api/bot/actions that checks what the web route checks: the
bearer secret and the body. Only the Bot API is recorded in memory (RecordingSession).
"""

import asyncio
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import pytest
from aiogram import Bot
from aiogram.methods import AnswerCallbackQuery, EditMessageText, SendMessage, SetChatMenuButton
from aiohttp import web

from fakes import (
    CHAT_ID,
    FIRST_NAME,
    TOKEN,
    RecordingSession,
    assert_no_leaks,
    call_asgi,
    make_message_update,
    webhook_secret,
)
from fakes import make_update as message_update
from fit_bot.asgi import WebhookApp
from fit_bot.config import Settings
from fit_bot.texts import CATALOG
from test_web_contract import ACTIONS_SECRET_VECTOR

PATH = "/telegram/webhook"
REQUEST = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b"
APP_BUTTON = {"text": "Ответить на запрос", "web_app": {"url": "https://app.example/trainer/requests?source=x"}}


@dataclass
class FakeWeb:
    """POST /api/bot/actions: 401 without the bot's secret, 400 for a body the route's schema refuses."""

    answer: Callable[[dict[str, Any]], web.StreamResponse]
    calls: list[dict[str, Any]] = field(default_factory=list)
    port: int = 0

    async def handle(self, request: web.Request) -> web.StreamResponse:
        if request.headers.get("Authorization") != f"Bearer {ACTIONS_SECRET_VECTOR}":
            return web.json_response({"error": "unauthorized"}, status=401)
        body = await request.json()
        self.calls.append(body)
        valid = (
            set(body) <= {"telegram_id", "data", "language_code"}
            and isinstance(body.get("telegram_id"), int)
            and isinstance(body.get("data"), str)
            and 0 < len(body["data"]) <= 64
        )
        if not valid:
            return web.json_response({"error": "bad_request"}, status=400)
        return self.answer(body)


def json_answer(notice: str, resolved: bool, line: str | None = None) -> Callable[[dict[str, Any]], web.Response]:
    return lambda _body: web.json_response({"notice": notice, "resolved": resolved, **({"line": line} if line else {})})


def callback(data: str, *, language_code: str = "ru", inline: bool = False, buttons: bool = True) -> dict[str, Any]:
    user = {"id": CHAT_ID, "is_bot": False, "first_name": FIRST_NAME, "language_code": language_code}
    query: dict[str, Any] = {"id": "q1", "from": user, "chat_instance": "c1", "data": data}
    if inline:
        query["inline_message_id"] = "inline-1"
    else:
        query["message"] = {
            "message_id": 5,
            "date": 1760000000,
            "chat": {"id": CHAT_ID, "type": "private", "first_name": FIRST_NAME},
            "text": "Запрос на запись",
            **(
                {
                    "reply_markup": {
                        "inline_keyboard": [
                            [
                                {"text": "Подтвердить", "callback_data": f"bky:{REQUEST}"},
                                {"text": "Отклонить", "callback_data": f"bkn:{REQUEST}"},
                            ],
                            [APP_BUTTON],
                        ]
                    }
                }
                if buttons
                else {}
            ),
        }
    return {"update_id": 3000, "callback_query": query}


@dataclass
class Outcome:
    status: int | None
    session: RecordingSession
    web_calls: list[dict[str, Any]]


def deliver(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    update: dict[str, Any],
    answer: Callable[[dict[str, Any]], web.StreamResponse] | None = None,
) -> Outcome:
    """Sends one update to the webhook the way Telegram does; a fake web answers action buttons."""
    session = RecordingSession()
    fake = FakeWeb(answer or json_answer("Ок.", False))

    async def run() -> int | None:
        app_web = web.Application()
        app_web.router.add_post("/api/bot/actions", fake.handle)
        runner = web.AppRunner(app_web, access_log=None)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        fake.port = runner.addresses[0][1]
        # The real URL is https on WEBAPP_URL's host; the stand-in listens on plain http on this machine.
        monkeypatch.setattr(Settings, "actions_url", lambda _self: f"http://127.0.0.1:{fake.port}/api/bot/actions")
        try:
            app = WebhookApp(load=lambda: settings, bot_factory=lambda _s: Bot(TOKEN, session=session))
            headers = {"content-type": "application/json", "x-telegram-bot-api-secret-token": webhook_secret()}
            result = await call_asgi(app, "POST", PATH, headers, json.dumps(update).encode())
            return result.status
        finally:
            await runner.cleanup()

    status = asyncio.run(run())
    return Outcome(status, session, fake.calls)


# Commands and text in a private chat


@pytest.mark.parametrize(("code", "locale"), [("ru", "ru"), ("en", "en"), ("de", "ru"), (None, "ru")])
def test_start_greets_in_the_senders_language_and_opens_the_app(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, code: str | None, locale: str
) -> None:
    outcome = deliver(settings, monkeypatch, message_update("/start", language_code=code))
    assert outcome.status == 200
    assert outcome.session.names() == ["SendMessage", "SetChatMenuButton"]
    reply = outcome.session.of(SendMessage)[0]
    assert reply.text == CATALOG[locale].start  # type: ignore[index]
    button = reply.reply_markup.inline_keyboard[0][0]  # type: ignore[union-attr]
    assert button.text == CATALOG[locale].open_app_button  # type: ignore[index]
    assert button.web_app.url == "https://app.example/?source=bot_start"  # type: ignore[union-attr]
    menu = outcome.session.of(SetChatMenuButton)[0]
    assert menu.chat_id == CHAT_ID
    assert menu.menu_button.type == ("default" if locale == "ru" else "web_app")  # type: ignore[union-attr]


@pytest.mark.parametrize(
    "payload",
    [
        "ref_abc123",
        "x" * 64,
        "<b>bold</b>",
        "промокод_осень",
        f"{FIRST_NAME}-secret",
    ],
)
def test_deep_links_get_the_same_greeting_and_never_see_their_payload_echoed(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, payload: str
) -> None:
    with caplog.at_level(logging.DEBUG):
        outcome = deliver(settings, monkeypatch, message_update(f"/start {payload}"))
    reply = outcome.session.of(SendMessage)[0]
    assert reply.text == CATALOG["ru"].start
    assert payload not in reply.text
    assert_no_leaks(caplog.records, payload)


def test_start_addressed_to_this_bot_works(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    outcome = deliver(settings, monkeypatch, message_update("/start@dafit_dev_bot"))
    assert outcome.session.of(SendMessage)[0].text == CATALOG["ru"].start


def test_help_opens_the_app_with_its_own_tag(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    outcome = deliver(settings, monkeypatch, message_update("/help", language_code="en"))
    reply = outcome.session.of(SendMessage)[0]
    assert reply.text == CATALOG["en"].help
    assert reply.reply_markup.inline_keyboard[0][0].web_app.url.endswith("?source=bot_help")  # type: ignore[union-attr]


@pytest.mark.parametrize("text", ["привет", "/settings", "/HELP", "/start@another_bot", "<script>", "🙂"])
def test_anything_else_says_nobody_reads_the_chat_and_offers_the_app(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, text: str
) -> None:
    outcome = deliver(settings, monkeypatch, message_update(text))
    # A command addressed to a bot makes aiogram ask for this bot's username first.
    assert [name for name in outcome.session.names() if name != "GetMe"] == ["SendMessage"]
    reply = outcome.session.of(SendMessage)[0]
    assert reply.text == CATALOG["ru"].fallback
    assert reply.reply_markup.inline_keyboard[0][0].web_app.url.endswith("?source=bot_reply")  # type: ignore[union-attr]


# What the bot leaves alone


def chat_member_update() -> dict[str, Any]:
    user = {"id": CHAT_ID, "is_bot": False, "first_name": FIRST_NAME}
    bot = {"id": 123456, "is_bot": True, "first_name": "DaFit"}
    return {
        "update_id": 4000,
        "my_chat_member": {
            "chat": {"id": CHAT_ID, "type": "private", "first_name": FIRST_NAME},
            "from": user,
            "date": 1760000000,
            "old_chat_member": {"status": "member", "user": bot},
            "new_chat_member": {"status": "kicked", "user": bot, "until_date": 0},
        },
    }


@pytest.mark.parametrize(
    "update",
    [
        pytest.param(message_update("/start", chat_type="group"), id="start in a group"),
        pytest.param(message_update("hello", chat_type="supergroup"), id="text in a supergroup"),
        pytest.param(
            make_message_update({"photo": [{"file_id": "f", "file_unique_id": "u", "width": 1, "height": 1}]}),
            id="photo",
        ),
        pytest.param(
            make_message_update({"contact": {"phone_number": "+70000000000", "first_name": FIRST_NAME}}), id="contact"
        ),
        pytest.param({"update_id": 5, "edited_message": message_update("/start")["message"]}, id="edited message"),
        pytest.param(
            {
                "update_id": 6,
                "channel_post": {"message_id": 1, "date": 1, "chat": {"id": -100, "type": "channel"}, "text": "/start"},
            },
            id="channel post",
        ),
        pytest.param(chat_member_update(), id="user blocked the bot"),
    ],
)
def test_updates_the_bot_does_not_answer(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, update: dict[str, Any]
) -> None:
    with caplog.at_level(logging.DEBUG):
        outcome = deliver(settings, monkeypatch, update)
    assert outcome.status == 200  # acknowledged, so Telegram does not resend it
    assert outcome.session.requests == []
    assert outcome.web_calls == []
    assert_no_leaks(caplog.records, "+70000000000")


# Action buttons


@pytest.mark.parametrize("prefix", ["bky", "bkn", "mcy", "mcn", "ctn"])
def test_a_settled_action_shows_the_popup_and_replaces_the_buttons_with_the_outcome(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, prefix: str
) -> None:
    data = f"{prefix}:{REQUEST}"
    with caplog.at_level(logging.DEBUG):
        outcome = deliver(settings, monkeypatch, callback(data), json_answer("Готово.", True, "Итог: <ок>"))
    assert outcome.web_calls == [{"telegram_id": CHAT_ID, "data": data, "language_code": "ru"}]
    assert outcome.session.names() == ["AnswerCallbackQuery", "EditMessageText"]
    popup = outcome.session.of(AnswerCallbackQuery)[0]
    assert (popup.callback_query_id, popup.text) == ("q1", "Готово.")
    edit = outcome.session.of(EditMessageText)[0]
    assert edit.text == "Запрос на запись\n\nИтог: &lt;ок&gt;"
    rows = edit.reply_markup.inline_keyboard  # type: ignore[union-attr]
    assert [[button.text for button in row] for row in rows] == [[APP_BUTTON["text"]]]
    assert_no_leaks(caplog.records, data, REQUEST)


def test_an_open_answer_keeps_the_buttons(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    outcome = deliver(settings, monkeypatch, callback(f"bky:{REQUEST}"), json_answer("Войди в DaFit.", False))
    assert outcome.session.names() == ["AnswerCallbackQuery"]


def test_a_settled_action_on_a_message_without_buttons_only_appends_the_line(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    outcome = deliver(
        settings, monkeypatch, callback(f"ctn:{REQUEST}", buttons=False), json_answer("Ок.", True, "Отказано.")
    )
    edit = outcome.session.of(EditMessageText)[0]
    assert edit.text == "Запрос на запись\n\nОтказано."
    assert edit.reply_markup is None


def test_a_button_under_an_inline_message_only_gets_the_popup(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    outcome = deliver(settings, monkeypatch, callback(f"bky:{REQUEST}", inline=True), json_answer("Ок.", True, "x"))
    assert outcome.session.names() == ["AnswerCallbackQuery"]


def server_error(_body: dict[str, Any]) -> web.Response:
    return web.json_response({"error": "failed"}, status=500)


def redirect(_body: dict[str, Any]) -> web.Response:
    return web.Response(status=307, headers={"Location": "https://elsewhere.example/"})


def html_page(_body: dict[str, Any]) -> web.Response:
    return web.Response(text="<html>Vercel error</html>", content_type="text/html")


def no_notice(_body: dict[str, Any]) -> web.Response:
    return web.json_response({"resolved": True})


@pytest.mark.parametrize("answer", [server_error, redirect, html_page, no_notice])
@pytest.mark.parametrize("code", ["ru", "en"])
def test_when_the_web_cannot_answer_the_popup_sends_the_person_to_the_app(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    answer: Callable[[dict[str, Any]], web.Response],
    code: str,
) -> None:
    with caplog.at_level(logging.DEBUG):
        outcome = deliver(settings, monkeypatch, callback(f"bky:{REQUEST}", language_code=code), answer)
    assert outcome.status == 200
    assert outcome.session.names() == ["AnswerCallbackQuery"]
    assert outcome.session.of(AnswerCallbackQuery)[0].text == CATALOG[code].action_failed  # type: ignore[index]
    assert_no_leaks(caplog.records, REQUEST)


def test_a_wrong_secret_is_refused_by_the_web(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    # A bot with another token derives another secret: the web refuses it, the person is sent to the app.
    monkeypatch.setattr(Settings, "actions_secret", lambda _self: "0" * 64)
    outcome = deliver(settings, monkeypatch, callback(f"bky:{REQUEST}"), json_answer("Готово.", True, "x"))
    assert outcome.web_calls == []
    assert outcome.session.of(AnswerCallbackQuery)[0].text == CATALOG["ru"].action_failed


@pytest.mark.parametrize("data", ["old:button", "bky", "bk:x", "", "xbky:1"])
def test_a_button_the_bot_does_not_know_just_stops_the_spinner(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, data: str
) -> None:
    outcome = deliver(settings, monkeypatch, callback(data))
    assert outcome.web_calls == []
    assert outcome.session.names() == ["AnswerCallbackQuery"]
    assert outcome.session.of(AnswerCallbackQuery)[0].text is None
