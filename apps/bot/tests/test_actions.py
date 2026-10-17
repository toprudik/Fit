import asyncio
import hashlib
import hmac
import json
import logging
from typing import Any

import pytest
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import AnswerCallbackQuery, EditMessageText
from aiogram.types import Update
from aiohttp import web

from fakes import CHAT_ID, FIRST_NAME, TOKEN, RecordingSession, assert_no_leaks, recording_bot
from fit_bot.config import Settings
from fit_bot.dispatcher import build_dispatcher
from fit_bot.handlers import actions
from fit_bot.handlers.actions import ActionAnswer, forward_action
from fit_bot.texts import CATALOG

BOOKING = "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b"
APP_URL = f"https://app.example/trainer/requests/{BOOKING}?source=booking_requested"


def callback_update(data: str, *, language_code: str = "ru", markup: bool = True) -> dict[str, Any]:
    """A tap on a booking request: bold name in the text, two action buttons and the Mini App button."""
    message: dict[str, Any] = {
        "message_id": 5,
        "date": 1760000000,
        "chat": {"id": CHAT_ID, "type": "private", "first_name": FIRST_NAME},
        "text": "Запрос на запись: Анна & Ко",
        "entities": [{"type": "bold", "offset": 18, "length": 4}],
    }
    if markup:
        message["reply_markup"] = {
            "inline_keyboard": [
                [{"text": "Подтвердить", "callback_data": f"bky:{BOOKING}"}],
                [{"text": "Отклонить", "callback_data": f"bkn:{BOOKING}"}],
                [{"text": "Ответить на запрос", "web_app": {"url": APP_URL}}],
            ]
        }
    user = {"id": CHAT_ID, "is_bot": False, "first_name": FIRST_NAME, "language_code": language_code}
    return {
        "update_id": 2000,
        "callback_query": {"id": "q1", "from": user, "chat_instance": "c1", "data": data, "message": message},
    }


def tap(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    data: str,
    answer: ActionAnswer | None,
    session: RecordingSession | None = None,
    **kwargs: Any,
) -> tuple[RecordingSession, list[dict[str, Any]]]:
    forwarded: list[dict[str, Any]] = []

    async def fake_forward(_settings: Settings, payload: dict[str, Any]) -> ActionAnswer | None:
        forwarded.append(payload)
        return answer

    monkeypatch.setattr(actions, "forward_action", fake_forward)
    session = session if session is not None else RecordingSession()
    update = Update.model_validate(callback_update(data, **kwargs))
    asyncio.run(build_dispatcher().feed_update(recording_bot(session), update, settings=settings))
    return session, forwarded


def test_settled_request_keeps_the_app_button_and_appends_the_line(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    answer = ActionAnswer("Запись подтверждена. Клиенту придёт сообщение.", True, "Подтверждено <сразу>.")
    session, forwarded = tap(settings, monkeypatch, f"bky:{BOOKING}", answer)

    assert forwarded == [{"telegram_id": CHAT_ID, "data": f"bky:{BOOKING}", "language_code": "ru"}]
    assert session.names() == ["AnswerCallbackQuery", "EditMessageText"]
    popup, edit = session.requests
    assert isinstance(popup, AnswerCallbackQuery) and isinstance(edit, EditMessageText)
    assert popup.callback_query_id == "q1" and popup.text == answer.notice
    assert edit.parse_mode == "HTML"
    assert edit.text == "Запрос на запись: <b>Анна</b> &amp; Ко\n\nПодтверждено &lt;сразу&gt;."
    assert edit.reply_markup is not None
    assert [[button.text for button in row] for row in edit.reply_markup.inline_keyboard] == [["Ответить на запрос"]]
    assert edit.reply_markup.inline_keyboard[0][0].web_app.url == APP_URL  # type: ignore[union-attr]


def test_a_message_without_other_buttons_loses_its_keyboard(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    session, _ = tap(settings, monkeypatch, f"bkn:{BOOKING}", ActionAnswer("Отклонён.", True), markup=False)
    edit = session.of(EditMessageText)[0]
    assert edit.reply_markup is None
    assert edit.text == "Запрос на запись: <b>Анна</b> &amp; Ко"


def test_an_unsettled_answer_only_shows_the_popup(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    session, _ = tap(settings, monkeypatch, f"bky:{BOOKING}", ActionAnswer("Войди в DaFit.", False))
    assert session.names() == ["AnswerCallbackQuery"]
    assert session.requests[0].text == "Войди в DaFit."


@pytest.mark.parametrize("code", ["ru", "en"])
def test_when_the_web_is_unreachable_the_popup_says_so(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, code: str
) -> None:
    session, _ = tap(settings, monkeypatch, f"bky:{BOOKING}", None, language_code=code)
    assert session.names() == ["AnswerCallbackQuery"]
    assert session.requests[0].text == CATALOG[code].action_failed  # type: ignore[index]


def test_an_unknown_button_just_stops_the_spinner(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    session, forwarded = tap(settings, monkeypatch, "old:button", ActionAnswer("x", True))
    assert forwarded == []
    assert session.names() == ["AnswerCallbackQuery"]
    assert session.requests[0].text is None


def test_failed_popup_and_edit_still_count(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    error = TelegramBadRequest(
        method=AnswerCallbackQuery(callback_query_id="q1"), message="Bad Request: query is too old"
    )
    session = RecordingSession(
        fail_on={
            AnswerCallbackQuery: error,
            EditMessageText: TelegramBadRequest(method=AnswerCallbackQuery(callback_query_id="q1"), message="nope"),
        }
    )
    with caplog.at_level(logging.WARNING):
        tap(settings, monkeypatch, f"bky:{BOOKING}", ActionAnswer("Ок.", True, "Подтверждено."), session=session)
    assert session.names() == ["AnswerCallbackQuery", "EditMessageText"]
    assert [r.getMessage() for r in caplog.records] == [
        "actions: could not answer the tap (TelegramBadRequest)",
        "actions: could not update the message (TelegramBadRequest)",
    ]


class FakeWeb:
    """The web route on 127.0.0.1: records each request and answers with the next (status, body)."""

    def __init__(self, status: int = 200, body: bytes = b"") -> None:
        self.status, self.body = status, body
        self.requests: list[tuple[str, str, dict[str, Any]]] = []

    async def handle(self, request: web.Request) -> web.Response:
        self.requests.append((request.path, request.headers.get("Authorization", ""), await request.json()))
        return web.Response(status=self.status, body=self.body, content_type="application/json")


async def call_web(fake: FakeWeb, settings: Settings, monkeypatch: pytest.MonkeyPatch) -> ActionAnswer | None:
    app = web.Application()
    app.router.add_post("/api/bot/actions", fake.handle)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = runner.addresses[0][1]
    monkeypatch.setattr(Settings, "actions_url", lambda _self: f"http://127.0.0.1:{port}/api/bot/actions")
    try:
        return await forward_action(settings, {"telegram_id": 7, "data": f"bky:{BOOKING}", "language_code": None})
    finally:
        await runner.cleanup()


def test_forward_sends_the_derived_secret_and_reads_the_answer(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeWeb(body=json.dumps({"notice": "n" * 300, "resolved": True, "line": "Подтверждено."}).encode())
    answer = asyncio.run(call_web(fake, settings, monkeypatch))

    assert answer == ActionAnswer("n" * 200, True, "Подтверждено.")
    secret = hmac.new(TOKEN.encode(), b"dafit/bot-actions/v1", hashlib.sha256).hexdigest()
    assert fake.requests == [
        ("/api/bot/actions", f"Bearer {secret}", {"telegram_id": 7, "data": f"bky:{BOOKING}", "language_code": None})
    ]


@pytest.mark.parametrize(
    ("status", "body"),
    [
        (500, b'{"error":"failed"}'),
        (401, b'{"error":"unauthorized"}'),
        (200, b"not json"),
        (200, b'["notice"]'),
        (200, b'{"notice":"","resolved":true}'),
        (200, b'{"notice":"ok","resolved":"yes"}'),
    ],
)
def test_forward_gives_none_for_a_bad_answer(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, status: int, body: bytes
) -> None:
    with caplog.at_level(logging.WARNING):
        assert asyncio.run(call_web(FakeWeb(status, body), settings, monkeypatch)) is None
    assert_no_leaks(caplog.records, BOOKING)


def test_forward_gives_none_when_the_web_is_down(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr(Settings, "actions_url", lambda _self: "http://127.0.0.1:9/api/bot/actions")
    with caplog.at_level(logging.WARNING):
        assert asyncio.run(forward_action(settings, {"telegram_id": 7, "data": "bky:x"})) is None
    assert [r.getMessage() for r in caplog.records] == ["actions: could not reach the web (ClientConnectorError)"]


def test_actions_url_and_secret(settings: Settings) -> None:
    assert settings.actions_url() == "https://app.example/api/bot/actions"
    other = Settings(telegram_bot_token=TOKEN, webapp_url="https://app.example/mini")  # type: ignore[arg-type]
    assert other.actions_url() == "https://app.example/api/bot/actions"
    assert settings.actions_secret() == hmac.new(TOKEN.encode(), b"dafit/bot-actions/v1", hashlib.sha256).hexdigest()
    assert settings.actions_secret() != settings.webhook_secret()
