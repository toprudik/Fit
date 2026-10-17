import asyncio
import io
from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import SetWebhook
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from fakes import RecordingSession, recording_bot, update_bytes, webhook_secret
from fit_bot.aiohttp_app import create_aiohttp_app
from fit_bot.config import Settings

PATH = "/telegram/webhook"


def with_client(app: web.Application, scenario: Callable[[TestClient], Awaitable[Any]]) -> Any:
    async def go() -> Any:
        async with TestClient(TestServer(app)) as client:
            return await scenario(client)

    return asyncio.run(go())


def test_webhook_with_and_without_the_secret(settings: Settings) -> None:
    session = RecordingSession()
    app = create_aiohttp_app(settings, bot=recording_bot(session), configure_on_startup=False)

    async def scenario(client: TestClient) -> None:
        missing = await client.post(PATH, data=update_bytes("/start"))
        assert missing.status == 401
        assert session.requests == []
        ok = await client.post(
            PATH, data=update_bytes("/start"), headers={"X-Telegram-Bot-Api-Secret-Token": webhook_secret()}
        )
        assert ok.status == 200
        assert await ok.read() == b"{}"
        assert session.names() == ["SendMessage", "SetChatMenuButton"]
        health = await client.get("/healthz")
        assert health.status == 200
        assert (await health.json())["configured"] is True
        assert (await client.get(PATH)).status == 405
        assert (await client.post("/other")).status == 404

    with_client(app, scenario)
    assert session.closed == 1  # closed on cleanup


def test_oversized_body_gets_413(settings: Settings) -> None:
    app = create_aiohttp_app(settings, bot=recording_bot(), configure_on_startup=False)

    async def scenario(client: TestClient) -> int:
        response = await client.post(
            PATH, data=io.BytesIO(b"x" * (2 << 20)), headers={"X-Telegram-Bot-Api-Secret-Token": webhook_secret()}
        )
        return response.status

    assert with_client(app, scenario) == 413


def test_startup_registers_the_webhook(settings: Settings) -> None:
    session = RecordingSession()
    app = create_aiohttp_app(settings, bot=recording_bot(session))

    async def scenario(client: TestClient) -> None:
        assert (await client.get("/healthz")).status == 200

    with_client(app, scenario)
    (call,) = session.of(SetWebhook)
    assert call.url == "https://bot.example/telegram/webhook"
    assert call.secret_token == webhook_secret()
    assert call.allowed_updates == ["callback_query", "message"]
    assert call.max_connections == 10
    assert call.drop_pending_updates is False
    assert "SetMyName" in session.names()
    assert "DeleteWebhook" not in session.names()


def test_failed_registration_stops_startup(settings: Settings) -> None:
    session = RecordingSession(
        fail_on={SetWebhook: TelegramBadRequest(SetWebhook(url="x"), "Bad Request: bad webhook")}
    )
    app = create_aiohttp_app(settings, bot=recording_bot(session))

    async def start() -> None:
        server = TestServer(app)  # no TestClient: its session would stay open when startup fails
        try:
            await server.start_server()
        finally:
            await server.close()

    with pytest.raises(
        RuntimeError, match="could not register the webhook: TelegramBadRequest: Bad Request: bad webhook"
    ):
        asyncio.run(start())
    assert session.names() == ["SetWebhook"]
