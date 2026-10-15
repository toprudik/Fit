"""Test doubles: obviously fake tokens, updates, a recording Bot API session, a fake Bot API server, an ASGI driver."""

import asyncio
import json
import logging
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.exceptions import ClientDecodeError
from aiogram.methods import (
    GetChatMenuButton,
    GetMe,
    GetMyCommands,
    GetMyDescription,
    GetMyName,
    GetMyShortDescription,
    GetWebhookInfo,
    Response,
    SendMessage,
    TelegramMethod,
)
from aiogram.methods.base import TelegramType
from aiogram.types import Message
from aiohttp import web
from pydantic import ValidationError

from fit_bot.config import derive_webhook_secret

TOKEN = "123456:TEST-token_for-unit-tests"
TOKEN_SECRET_PART = TOKEN.split(":", 1)[1]
BOT_ID = 123456
CHAT_ID = 900777123
FIRST_NAME = "Zelda"
DEV_BOT_USERNAME = "dafit_dev_bot"


def webhook_secret() -> str:
    """Computed, never written down (gitleaks)."""
    return derive_webhook_secret(TOKEN)


def make_message_update(
    fields: dict[str, Any],
    *,
    language_code: str | None = "ru",
    chat_type: str = "private",
    update_id: int = 1000,
) -> dict[str, Any]:
    user: dict[str, Any] = {"id": CHAT_ID, "is_bot": False, "first_name": FIRST_NAME}
    if language_code is not None:
        user["language_code"] = language_code
    chat: dict[str, Any] = (
        {"id": CHAT_ID, "type": "private", "first_name": FIRST_NAME}
        if chat_type == "private"
        else {"id": -1001234567890, "type": chat_type, "title": "Group"}
    )
    message = {"message_id": 5, "date": 1760000000, "chat": chat, "from": user, **fields}
    return {"update_id": update_id, "message": message}


def make_update(
    text: str = "/start",
    *,
    language_code: str | None = "ru",
    chat_type: str = "private",
    update_id: int = 1000,
) -> dict[str, Any]:
    fields: dict[str, Any] = {"text": text}
    if text.startswith("/"):
        fields["entities"] = [{"type": "bot_command", "offset": 0, "length": len(text.split()[0])}]
    return make_message_update(fields, language_code=language_code, chat_type=chat_type, update_id=update_id)


def update_bytes(text: str = "/start", **kwargs: Any) -> bytes:
    return json.dumps(make_update(text, **kwargs)).encode()


def fake_message(chat_id: int, text: str) -> dict[str, Any]:
    return {"message_id": 1, "date": 1760000000, "chat": {"id": chat_id, "type": "private"}, "text": text}


DEFAULT_RESULTS: dict[type, Any] = {
    GetMe: {"id": BOT_ID, "is_bot": True, "first_name": "DaFit", "username": DEV_BOT_USERNAME},
    GetWebhookInfo: {"url": "", "has_custom_certificate": False, "pending_update_count": 0},
    GetMyCommands: [],
    GetMyDescription: {"description": ""},
    GetMyShortDescription: {"short_description": ""},
    GetMyName: {"name": ""},
    GetChatMenuButton: {"type": "commands"},
}


class RecordingSession(BaseSession):
    """Records every Bot API call; results go through check_response, so they are parsed like real answers."""

    def __init__(
        self,
        *,
        responses: dict[type, Any] | None = None,
        fail_with: Exception | None = None,
        fail_on: dict[type, Exception] | None = None,
    ) -> None:
        super().__init__()
        self.requests: list[TelegramMethod[Any]] = []
        self.responses: dict[type, Any] = {**DEFAULT_RESULTS, **(responses or {})}
        self.fail_with = fail_with
        self.fail_on: dict[type, Exception] = dict(fail_on or {})
        self.closed = 0

    async def make_request(self, bot: Bot, method: TelegramMethod[TelegramType], timeout: int | None = None) -> Any:  # noqa: ASYNC109 (BaseSession signature)
        self.requests.append(method)
        error = self.fail_on.get(type(method)) or self.fail_with
        if error is not None:
            raise error
        raw = json.dumps({"ok": True, "result": self.result_for(method)})
        return self.check_response(bot=bot, method=method, status_code=200, content=raw).result

    def result_for(self, method: TelegramMethod[Any]) -> Any:
        if isinstance(method, SendMessage):
            return fake_message(int(method.chat_id), method.text)
        value = self.responses.get(type(method), True)
        return value(method) if callable(value) else value

    async def stream_content(self, *args: Any, **kwargs: Any) -> Any:  # pragma: no cover
        raise NotImplementedError

    async def close(self) -> None:
        self.closed += 1

    def names(self) -> list[str]:
        return [type(method).__name__ for method in self.requests]

    def of(self, kind: type) -> list[Any]:
        return [method for method in self.requests if isinstance(method, kind)]


def recording_bot(session: RecordingSession | None = None) -> Bot:
    return Bot(TOKEN, session=session if session is not None else RecordingSession())


class FakeBotAPI:
    """A local Bot API on 127.0.0.1 in the test's own loop. Use with AiohttpSession(api=fake.api_server)."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []
        #: (status, content type, body) for the next call only.
        self.next_error: tuple[int, str, bytes] | None = None
        self.port = 0
        self._runner: web.AppRunner | None = None

    @property
    def api_server(self) -> TelegramAPIServer:
        return TelegramAPIServer.from_base(f"http://127.0.0.1:{self.port}")

    def methods(self) -> list[str]:
        return [method for method, _ in self.calls]

    async def start(self) -> None:
        app = web.Application()
        app.router.add_post("/bot{token}/{method}", self._handle)
        self._runner = web.AppRunner(app, access_log=None)  # an access log would print /bot<TOKEN>/... URLs
        await self._runner.setup()
        site = web.TCPSite(self._runner, "127.0.0.1", 0)
        await site.start()
        self.port = self._runner.addresses[0][1]

    async def stop(self) -> None:
        if self._runner is not None:
            await self._runner.cleanup()
            self._runner = None

    async def __aenter__(self) -> "FakeBotAPI":
        await self.start()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.stop()

    async def _handle(self, request: web.Request) -> web.Response:
        form = await request.post()
        method = request.match_info["method"]
        self.calls.append((method, {key: str(value) for key, value in form.items()}))
        if self.next_error is not None:
            status, content_type, body = self.next_error
            self.next_error = None
            return web.Response(status=status, body=body, content_type=content_type)
        if method.lower() == "sendmessage":
            return web.json_response({"ok": True, "result": fake_message(int(form["chat_id"]), str(form["text"]))})
        return web.json_response({"ok": True, "result": True})


@dataclass
class AsgiResult:
    status: int | None
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes = b""
    receive_calls: int = 0


async def call_asgi(
    app: Any,
    method: str,
    path: str,
    headers: dict[str, str] | Iterable[tuple[bytes, bytes]] = (),
    body: bytes = b"",
    *,
    chunks: list[bytes] | None = None,
    disconnect_after: int | None = None,
) -> AsgiResult:
    """Drives an ASGI callable once. `chunks` streams the body; `disconnect_after` disconnects after N chunks."""
    raw_headers = (
        [(key.lower().encode(), value.encode()) for key, value in headers.items()]
        if isinstance(headers, dict)
        else list(headers)
    )
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "https",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("149.154.167.1", 443),
        "server": ("bot.example", 443),
    }
    parts = chunks if chunks is not None else [body]
    result = AsgiResult(status=None)

    async def receive() -> dict[str, Any]:
        index = result.receive_calls
        result.receive_calls += 1
        if disconnect_after is not None and index >= disconnect_after:
            return {"type": "http.disconnect"}
        if index < len(parts):
            return {"type": "http.request", "body": parts[index], "more_body": index < len(parts) - 1}
        await asyncio.sleep(3600)
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        if message["type"] == "http.response.start":
            result.status = message["status"]
            result.headers = {key.decode(): value.decode() for key, value in message.get("headers", [])}
        elif message["type"] == "http.response.body":
            result.body += message.get("body", b"")

    await app(scope, receive, send)
    return result


def decode_error(validation: bool) -> ClientDecodeError:
    """A ClientDecodeError built the way aiogram builds it; its data holds personal data and a message text."""
    if validation:
        data = {
            "ok": True,
            "result": {"message_id": "not-a-number", "chat": {"id": CHAT_ID, "first_name": FIRST_NAME}, "text": "hi"},
        }
        try:
            Response[Message].model_validate(data)
        except ValidationError as error:
            return ClientDecodeError("Failed to deserialize object", error, data)
        raise AssertionError("expected a ValidationError")
    content = f"<html>502 Bad Gateway for chat {CHAT_ID} {FIRST_NAME}</html>"
    try:
        json.loads(content)
    except json.JSONDecodeError as error:
        return ClientDecodeError("Failed to decode object", error, content)
    raise AssertionError("expected a JSONDecodeError")


def forbidden_fragments(*texts: str) -> list[str]:
    """Values that must never reach a log record."""
    return [TOKEN, TOKEN_SECRET_PART, webhook_secret(), str(CHAT_ID), FIRST_NAME, *texts]


def assert_no_leaks(records: Iterable[logging.LogRecord], *texts: str) -> None:
    fragments = forbidden_fragments(*texts)
    for record in records:
        assert record.exc_info is None, f"{record.name} logged exc_info"
        rendered = record.getMessage() + (record.exc_text or "")
        for fragment in fragments:
            assert fragment not in rendered, f"{record.name} {record.levelname} leaked a value: {rendered[:200]!r}"
