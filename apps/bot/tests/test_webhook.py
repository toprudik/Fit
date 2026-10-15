import asyncio
import json
import logging
from typing import Any

import pytest
from aiogram import Dispatcher, Router
from aiogram.dispatcher.event.bases import UNHANDLED
from aiogram.exceptions import (
    RestartingTelegram,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramNetworkError,
    TelegramNotFound,
    TelegramRetryAfter,
    TelegramServerError,
    TelegramUnauthorizedError,
)
from aiogram.filters import Command
from aiogram.methods import SendMessage
from aiogram.types import Message, Update

from fakes import (
    FIRST_NAME,
    TOKEN,
    RecordingSession,
    assert_no_leaks,
    decode_error,
    make_update,
    recording_bot,
    update_bytes,
)
from fit_bot.config import Settings
from fit_bot.dispatcher import build_dispatcher
from fit_bot.texts import CATALOG
from fit_bot.webhook import (
    BOT_API_TIMEOUT,
    Outcome,
    describe_error,
    event_type,
    expected_secret,
    header_value,
    make_bot,
    parse_update,
    process_update,
    secret_matches,
)

SEND = SendMessage(chat_id=1, text="x")


def run(
    settings: Settings, update: dict[str, Any], *, session: RecordingSession | None = None, dp: Dispatcher | None = None
) -> tuple[Outcome, RecordingSession]:
    session = session if session is not None else RecordingSession()
    outcome = asyncio.run(
        process_update(
            dp or build_dispatcher(), recording_bot(session), Update.model_validate(update), settings=settings
        )
    )
    return outcome, session


def failing(error: Exception) -> RecordingSession:
    return RecordingSession(fail_with=error)


def crash_dispatcher() -> Dispatcher:
    router = Router()

    @router.message(Command("crash"))
    async def crash(message: Message) -> None:
        raise ValueError(FIRST_NAME)

    @router.message(Command("returned"))
    async def returned(message: Message) -> Any:
        return message.answer("sent from the return value")

    dp = Dispatcher(disable_fsm=True)
    dp.include_router(router)
    return dp


def test_header_value() -> None:
    headers = [
        (b"Content-Type", b"application/json"),
        (b"X-Telegram-Bot-Api-Secret-Token", b"abc"),
        (b"x-telegram-bot-api-secret-token", b"second"),
    ]
    assert header_value(headers, b"x-telegram-bot-api-secret-token") == b"abc"
    assert header_value(headers, b"X-TELEGRAM-BOT-API-SECRET-TOKEN") == b"abc"
    assert header_value(headers, b"missing") == b""


def test_secret_matches(settings: Settings) -> None:
    expected = expected_secret(settings)
    assert secret_matches(expected, expected)
    assert not secret_matches(b"wrong", expected)
    assert not secret_matches(expected[:-1], expected)
    assert not secret_matches("é".encode(), expected)
    assert not secret_matches(b"", expected)
    assert not secret_matches(b"", b"")
    assert not secret_matches(b"anything", b"")


@pytest.mark.parametrize("body", [b"{not json", b'{"hello": 1}', f'{{"update_id": "{FIRST_NAME}"}}'.encode(), b""])
def test_parse_update_rejects_unreadable_bodies(caplog: pytest.LogCaptureFixture, body: bytes) -> None:
    caplog.set_level(logging.DEBUG)
    assert parse_update(body) is None
    assert [r.getMessage() for r in caplog.records if r.name.startswith("fit_bot")] == [
        f"webhook: authenticated request with an unreadable update body ({len(body)} bytes)"
    ]
    assert_no_leaks(caplog.records)


def test_parse_update_and_event_type() -> None:
    update = parse_update(update_bytes("/start"))
    assert update is not None and update.update_id == 1000
    assert event_type(update) == "message"
    assert event_type(Update(update_id=5)) == "unknown"


def test_make_bot(settings: Settings) -> None:
    bot = make_bot(settings)
    assert bot.token == TOKEN
    assert bot.session.timeout == BOT_API_TIMEOUT
    assert bot.default.parse_mode is None
    asyncio.run(bot.session.close())


def test_handled_and_unhandled(settings: Settings) -> None:
    outcome, session = run(settings, make_update("/start"))
    assert outcome == Outcome(200)
    assert session.names() == ["SendMessage", "SetChatMenuButton"]
    outcome, session = run(settings, make_update("/start", chat_type="group"))
    assert outcome == Outcome(200)
    assert session.requests == []


@pytest.mark.parametrize(("retry_after", "expected"), [(0, b"1"), (7, b"7"), (99999, b"3600")])
def test_flood_control_is_retried_later(settings: Settings, retry_after: int, expected: bytes) -> None:
    outcome, _ = run(
        settings, make_update("/start"), session=failing(TelegramRetryAfter(SEND, "Too Many Requests", retry_after))
    )
    assert outcome == Outcome(503, ((b"retry-after", expected),))


@pytest.mark.parametrize(
    "error",
    [
        TelegramNetworkError(SEND, "ClientConnectorError: refused"),
        TelegramServerError(SEND, "Internal Server Error"),
        RestartingTelegram(SEND, "restart"),
    ],
)
def test_outages_are_retried(settings: Settings, caplog: pytest.LogCaptureFixture, error: Exception) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, _ = run(settings, make_update("/start"), session=failing(error))
    assert outcome == Outcome(503, ((b"retry-after", b"5"),))
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    assert record.levelno == logging.WARNING
    assert type(error).__name__ in record.getMessage()
    assert "refused" not in record.getMessage()


@pytest.mark.parametrize(
    "error", [TelegramUnauthorizedError(SEND, "Unauthorized"), TelegramNotFound(SEND, "Not Found")]
)
def test_rejected_token_is_retried_after_a_minute(
    settings: Settings, caplog: pytest.LogCaptureFixture, error: Exception
) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, _ = run(settings, make_update("/start"), session=failing(error))
    assert outcome == Outcome(503, ((b"retry-after", b"60"),))
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    assert record.levelno == logging.ERROR
    assert "rejected this deployment's token" in record.getMessage()
    assert "TELEGRAM_BOT_TOKEN" in record.getMessage()


def test_undecodable_answer_is_retried(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, _ = run(settings, make_update("/start"), session=failing(decode_error(False)))
    assert outcome == Outcome(503, ((b"retry-after", b"5"),))
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    assert record.levelno == logging.WARNING
    assert "JSONDecodeError" in record.getMessage()


def test_answer_that_fails_the_model_is_dropped(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, _ = run(settings, make_update("/start"), session=failing(decode_error(True)))
    assert outcome == Outcome(200)
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    assert record.levelno == logging.ERROR
    assert "ValidationError" in record.getMessage()


def test_blocked_user_is_dropped(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, _ = run(
        settings,
        make_update("/start"),
        session=failing(TelegramForbiddenError(SEND, "Forbidden: bot was blocked by the user")),
    )
    assert outcome == Outcome(200)
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    assert record.levelno == logging.WARNING
    assert "blocked" in record.getMessage()


def test_bad_request_is_dropped_with_telegrams_description(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, _ = run(
        settings, make_update("/start"), session=failing(TelegramBadRequest(SEND, "Bad Request: chat not found"))
    )
    assert outcome == Outcome(200)
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    assert record.levelno == logging.ERROR
    assert "TelegramBadRequest: Bad Request: chat not found" in record.getMessage()


def test_handler_bug_is_dropped_without_its_message(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING, logger="fit_bot")
    outcome, session = run(settings, make_update("/crash"), dp=crash_dispatcher())
    assert outcome == Outcome(200)
    assert session.requests == []
    (record,) = [r for r in caplog.records if r.name == "fit_bot.webhook"]
    message = record.getMessage()
    assert record.levelno == logging.ERROR
    assert "handler failed on update 1000 (message): ValueError\n" in message
    assert 'File "' in message and "raise ValueError(FIRST_NAME)" in message
    assert FIRST_NAME not in message.replace("FIRST_NAME", "")


def test_returned_method_is_executed(settings: Settings) -> None:
    outcome, session = run(settings, make_update("/returned"), dp=crash_dispatcher())
    assert outcome == Outcome(200)
    assert session.names() == ["SendMessage"]
    assert session.requests[0].text == "sent from the return value"


def test_describe_error() -> None:
    assert describe_error(ValueError(FIRST_NAME)) == "ValueError"
    assert (
        describe_error(TelegramBadRequest(SEND, "Bad Request: chat not found"))
        == "TelegramBadRequest: Bad Request: chat not found"
    )
    assert (
        describe_error(TelegramNetworkError(SEND, "ClientConnectorError: https://api.telegram.org/bot<token>"))
        == "TelegramNetworkError (ClientConnectorError)"
    )
    assert describe_error(TelegramNetworkError(SEND, "Request timeout error")) == "TelegramNetworkError (TimeoutError)"
    assert describe_error(TelegramNetworkError(SEND, "https://api.telegram.org/bot<token>")) == "TelegramNetworkError"
    assert (
        describe_error(TelegramRetryAfter(SendMessage(chat_id=42, text="x"), "Too Many Requests", 3))
        == "TelegramRetryAfter"
    )
    assert describe_error(decode_error(True)) == "ClientDecodeError"


def test_describe_error_names_the_wrapped_cause_only() -> None:
    try:
        try:
            raise OSError(f"cannot reach https://api.telegram.org/bot{TOKEN}/sendMessage")
        except OSError as cause:
            raise TelegramNetworkError(SEND, f"ClientOSError: {cause}") from cause
    except TelegramNetworkError as error:
        described = describe_error(error)
    assert described == "TelegramNetworkError (OSError)"
    assert TOKEN not in described


def test_no_leaks_in_any_scenario(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    errors: list[Exception] = [
        decode_error(True),
        decode_error(False),
        TelegramBadRequest(SEND, "Bad Request: chat not found"),
        TelegramNetworkError(SEND, f"ClientConnectorError: https://api.telegram.org/bot{TOKEN}/sendMessage"),
        TelegramRetryAfter(SendMessage(chat_id=1, text="x"), "Too Many Requests", 3),
        TelegramUnauthorizedError(SEND, "Unauthorized"),
        TelegramForbiddenError(SEND, "Forbidden"),
    ]
    for error in errors:
        run(settings, make_update("/start"), session=failing(error))
    run(settings, make_update("/crash"), dp=crash_dispatcher())
    run(settings, make_update("hello there"))
    parse_update(b'{"update_id": "' + FIRST_NAME.encode() + b'"}')
    assert caplog.records
    assert_no_leaks(caplog.records, CATALOG["ru"].start, "hello there")


def test_unhandled_returns_the_sentinel(settings: Settings) -> None:
    dp = build_dispatcher()
    result = asyncio.run(
        dp.feed_update(recording_bot(), Update.model_validate(make_update("x", chat_type="group")), settings=settings)
    )
    assert result is UNHANDLED
    assert json.loads(b"{}") == {}
