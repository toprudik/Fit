import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from aiogram import Bot, Dispatcher, Router
from aiogram.exceptions import TelegramRetryAfter, TelegramServerError
from aiogram.filters import Command
from aiogram.methods import SendMessage
from aiogram.types import Message

from fakes import (
    BOT_ID,
    FIRST_NAME,
    TOKEN,
    AsgiResult,
    RecordingSession,
    assert_no_leaks,
    call_asgi,
    decode_error,
    update_bytes,
    webhook_secret,
)
from fit_bot.asgi import WebhookApp
from fit_bot.config import Settings, SettingsError
from fit_bot.handlers import build_router
from fit_bot.texts import CATALOG

PATH = "/telegram/webhook"
SEND = SendMessage(chat_id=1, text="x")


def good_headers() -> dict[str, str]:
    return {"content-type": "application/json", "x-telegram-bot-api-secret-token": webhook_secret()}


def make_app(settings: Settings, session: RecordingSession, *, dispatcher: Dispatcher | None = None) -> WebhookApp:
    return WebhookApp(load=lambda: settings, bot_factory=lambda s: Bot(TOKEN, session=session), dispatcher=dispatcher)


def call(app: Any, method: str, path: str, headers: Any = (), body: bytes = b"", **kwargs: Any) -> AsgiResult:
    return asyncio.run(call_asgi(app, method, path, headers, body, **kwargs))


def crash_dispatcher() -> Dispatcher:
    router = Router()

    @router.message(Command("crash"))
    async def crash(message: Message) -> None:
        raise ValueError(FIRST_NAME)

    dp = Dispatcher(disable_fsm=True)
    dp.include_router(router)
    dp.include_router(build_router())  # the real handlers after the crashing one
    return dp


def test_start_with_the_right_secret(settings: Settings) -> None:
    session = RecordingSession()
    result = call(make_app(settings, session), "POST", PATH, good_headers(), update_bytes("/start"))
    assert result.status == 200
    assert result.body == b"{}"
    assert result.headers["content-type"] == "application/json"
    assert result.headers["cache-control"] == "no-store"
    assert session.names() == ["SendMessage", "SetChatMenuButton"]
    assert session.closed == 1


@pytest.mark.parametrize(
    "headers",
    [
        {"x-telegram-bot-api-secret-token": "wrong"},
        {},
        [(b"x-telegram-bot-api-secret-token", "é".encode())],
        {"x-telegram-bot-api-secret-token": webhook_secret()[:-1]},
    ],
    ids=["wrong", "missing", "non-ascii", "shorter"],
)
def test_wrong_secret_is_rejected_before_reading_the_body(
    settings: Settings, caplog: pytest.LogCaptureFixture, headers: Any
) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    session = RecordingSession()
    result = call(make_app(settings, session), "POST", PATH, headers, update_bytes("/start"))
    assert result.status == 401
    assert result.body == b""
    assert result.receive_calls == 0
    assert session.requests == []
    assert session.closed == 0
    assert [r.getMessage() for r in caplog.records if r.name.startswith("fit_bot")] == [
        "webhook: rejected a request with a wrong or missing secret token"
    ]


def test_routing(settings: Settings) -> None:
    app = make_app(settings, RecordingSession())
    get = call(app, "GET", PATH, good_headers())
    assert (get.status, get.headers["allow"]) == (405, "POST")
    assert call(app, "POST", "/other", good_headers(), update_bytes()).status == 404
    assert call(app, "POST", PATH + "/", good_headers(), update_bytes()).status == 404
    assert call(app, "GET", "/", {}).status == 404
    post_health = call(app, "POST", "/healthz", {})
    assert (post_health.status, post_health.headers["allow"]) == (405, "GET, HEAD")


def test_oversized_bodies(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    session = RecordingSession()
    app = make_app(settings, session)
    declared = call(app, "POST", PATH, {**good_headers(), "content-length": str(2 << 20)}, b"x")
    assert declared.status == 413
    assert declared.receive_calls == 0
    chunked = call(app, "POST", PATH, good_headers(), chunks=[b"x" * (1 << 19)] * 4)
    assert chunked.status == 413
    assert session.requests == []
    assert [r.getMessage() for r in caplog.records if r.name.startswith("fit_bot")] == [
        "webhook: rejected a request body over 1048576 bytes"
    ] * 2


def test_body_at_the_limit_is_read(settings: Settings) -> None:
    body = update_bytes("/start")
    padded = body[:-1] + b" " * (1_048_576 - len(body)) + b"}"
    session = RecordingSession()
    result = call(make_app(settings, session), "POST", PATH, good_headers(), chunks=[padded[:1000], padded[1000:]])
    assert result.status == 200
    assert session.names() == ["SendMessage", "SetChatMenuButton"]


def test_disconnect_mid_body_gets_no_response(settings: Settings) -> None:
    session = RecordingSession()
    body = update_bytes("/start")
    result = call(
        make_app(settings, session), "POST", PATH, good_headers(), chunks=[body[:10], body[10:]], disconnect_after=1
    )
    assert result.status is None
    assert session.requests == []


def test_bad_json_is_acknowledged(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    session = RecordingSession()
    result = call(make_app(settings, session), "POST", PATH, good_headers(), b"{not json")
    assert (result.status, result.body) == (200, b"{}")
    assert session.requests == []
    assert session.closed == 0  # no bot was created
    assert [r.getMessage() for r in caplog.records if r.name.startswith("fit_bot")] == [
        "webhook: authenticated request with an unreadable update body (9 bytes)"
    ]


def test_handler_crash_is_acknowledged(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    session = RecordingSession()
    result = call(
        make_app(settings, session, dispatcher=crash_dispatcher()), "POST", PATH, good_headers(), update_bytes("/crash")
    )
    assert (result.status, result.body) == (200, b"{}")
    assert session.closed == 1
    (record,) = [r for r in caplog.records if r.levelno == logging.ERROR and r.name.startswith("fit_bot")]
    assert "handler failed on update 1000 (message): ValueError" in record.getMessage()


@pytest.mark.parametrize(
    ("error", "retry_after"),
    [
        (TelegramServerError(SEND, "Internal Server Error"), "5"),
        (TelegramRetryAfter(SEND, "Too Many Requests", 7), "7"),
    ],
)
def test_retryable_failures(settings: Settings, error: Exception, retry_after: str) -> None:
    session = RecordingSession(fail_with=error)
    result = call(make_app(settings, session), "POST", PATH, good_headers(), update_bytes("/start"))
    assert result.status == 503
    assert result.headers["retry-after"] == retry_after
    assert result.body == b""
    assert session.closed == 1


def test_invalid_settings_answer_500_and_log_once(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    calls = 0

    def load() -> Settings:
        nonlocal calls
        calls += 1
        raise SettingsError("Invalid bot environment: WEBAPP_URL. See .env.example.")

    app = WebhookApp(load=load)
    first = call(app, "POST", PATH, good_headers(), update_bytes())
    second = call(app, "POST", PATH, good_headers(), update_bytes())
    assert (first.status, second.status) == (500, 500)
    assert calls == 1
    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR and r.name.startswith("fit_bot")]
    assert errors == ["Invalid bot environment: WEBAPP_URL. See .env.example."]
    health = call(app, "GET", "/healthz")
    assert json.loads(health.body)["configured"] is False
    assert calls == 1


def test_healthz_configured(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef")
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    result = call(make_app(settings, RecordingSession()), "GET", "/healthz")
    assert result.status == 200
    assert result.headers["cache-control"] == "no-store"
    assert result.headers["content-type"] == "application/json"
    assert json.loads(result.body) == {
        "configured": True,
        "commit": "0123456789abcdef",
        "env": "production",
        "bot_id": BOT_ID,
    }
    assert TOKEN.split(":")[1] not in result.body.decode()


def test_healthz_unconfigured_shows_a_leaked_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)  # a token in Preview without WEBAPP_URL
    result = call(WebhookApp(), "GET", "/healthz")
    assert result.status == 200
    assert json.loads(result.body) == {"configured": False, "commit": None, "env": None, "bot_id": BOT_ID}


def test_healthz_empty_environment() -> None:
    result = call(WebhookApp(), "GET", "/healthz")
    assert json.loads(result.body) == {"configured": False, "commit": None, "env": None, "bot_id": None}


def test_head_healthz_has_no_body(settings: Settings) -> None:
    result = call(make_app(settings, RecordingSession()), "HEAD", "/healthz")
    assert result.status == 200
    assert result.body == b""
    assert int(result.headers["content-length"]) > 0


def test_lifespan() -> None:
    sent: list[str] = []
    messages = iter([{"type": "lifespan.startup"}, {"type": "lifespan.shutdown"}])

    async def receive() -> dict[str, Any]:
        return next(messages)

    async def send(message: dict[str, Any]) -> None:
        sent.append(message["type"])

    asyncio.run(WebhookApp()({"type": "lifespan"}, receive, send))
    assert sent == ["lifespan.startup.complete", "lifespan.shutdown.complete"]


def test_other_scopes_are_ignored() -> None:
    async def never() -> dict[str, Any]:
        raise AssertionError("receive must not be called")

    async def send(message: dict[str, Any]) -> None:
        raise AssertionError("send must not be called")

    asyncio.run(WebhookApp()({"type": "websocket", "path": "/"}, never, send))


def test_each_request_gets_its_own_bot(settings: Settings) -> None:
    sessions: list[RecordingSession] = []

    def factory(_: Settings) -> Bot:
        sessions.append(RecordingSession())
        return Bot(TOKEN, session=sessions[-1])

    app = WebhookApp(load=lambda: settings, bot_factory=factory)
    first = call(app, "POST", PATH, good_headers(), update_bytes("/start", update_id=1))
    second = call(app, "POST", PATH, good_headers(), update_bytes("/help", update_id=2))
    assert (first.status, second.status) == (200, 200)
    assert [s.names() for s in sessions] == [["SendMessage", "SetChatMenuButton"]] * 2
    assert [s.closed for s in sessions] == [1, 1]


def test_import_with_an_empty_environment() -> None:
    src = Path(__file__).resolve().parents[1] / "src"
    completed = subprocess.run(  # noqa: S603
        [sys.executable, "-c", "import fit_bot.asgi as m; print(type(m.app).__name__)"],
        env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(src)},
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == "WebhookApp"


def test_no_leaks_in_any_scenario(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    for error in (decode_error(True), decode_error(False), TelegramServerError(SEND, "Internal Server Error")):
        call(
            make_app(settings, RecordingSession(fail_with=error)), "POST", PATH, good_headers(), update_bytes("/start")
        )
    call(
        make_app(settings, RecordingSession(), dispatcher=crash_dispatcher()),
        "POST",
        PATH,
        good_headers(),
        update_bytes("/crash"),
    )
    call(make_app(settings, RecordingSession()), "POST", PATH, good_headers(), update_bytes("my secret words"))
    call(
        make_app(settings, RecordingSession()), "POST", PATH, {"x-telegram-bot-api-secret-token": TOKEN}, update_bytes()
    )
    call(
        make_app(settings, RecordingSession()),
        "POST",
        PATH,
        good_headers(),
        f'{{"update_id": "{FIRST_NAME}"}}'.encode(),
    )
    assert caplog.records
    assert_no_leaks(caplog.records, CATALOG["ru"].start, CATALOG["ru"].fallback, "my secret words")
