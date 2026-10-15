"""Local end-to-end smoke: the ASGI app behind a real HTTP server (uvicorn, as on Vercel) with a fake Bot API.

Every Bot API call goes through the real AiohttpSession; every request through a real aiohttp client.
"""

import asyncio
import io
import json
import logging
from dataclasses import dataclass, field

import aiohttp
import pytest
import uvicorn
from aiogram import Dispatcher, Router
from aiogram.filters import Command
from aiogram.types import Message

from fakes import FIRST_NAME, FakeBotAPI, assert_no_leaks, update_bytes, webhook_secret
from fit_bot.asgi import WebhookApp
from fit_bot.config import Settings
from fit_bot.handlers import build_router
from fit_bot.texts import CATALOG
from fit_bot.webhook import make_bot

PATH = "/telegram/webhook"


@dataclass
class Exchange:
    label: str
    status: int
    retry_after: str | None
    body: bytes
    bot_api_calls: list[str] = field(default_factory=list)


def smoke_dispatcher() -> Dispatcher:
    """The real handlers, plus /crash in front of them to prove a handler bug is acknowledged."""
    crash = Router(name="crash")

    @crash.message(Command("crash"))
    async def on_crash(message: Message) -> None:
        raise ValueError(FIRST_NAME)

    dp = Dispatcher(disable_fsm=True)
    dp.include_router(crash)
    dp.include_router(build_router())
    return dp


async def run_smoke(settings: Settings) -> tuple[list[Exchange], FakeBotAPI]:
    fake = FakeBotAPI()
    await fake.start()
    app = WebhookApp(
        load=lambda: settings,
        bot_factory=lambda s: make_bot(s, api=fake.api_server),
        dispatcher=smoke_dispatcher(),
    )
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=0, lifespan="auto", log_level="warning", log_config=None)
    )
    task = asyncio.create_task(server.serve())
    exchanges: list[Exchange] = []
    try:
        while not server.started:
            if task.done():
                task.result()
            await asyncio.sleep(0.01)
        port = server.servers[0].sockets[0].getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        secret = {"X-Telegram-Bot-Api-Secret-Token": webhook_secret(), "Content-Type": "application/json"}

        async with aiohttp.ClientSession() as http:

            async def exchange(
                label: str,
                method: str,
                path: str,
                *,
                headers: dict[str, str] | None = None,
                data: bytes | io.BytesIO = b"",
                error: tuple[int, str, bytes] | None = None,
            ) -> None:
                fake.next_error = error
                before = len(fake.calls)
                async with http.request(method, base + path, headers=headers or {}, data=data) as response:
                    body = await response.read()
                    exchanges.append(
                        Exchange(
                            label, response.status, response.headers.get("Retry-After"), body, fake.methods()[before:]
                        )
                    )

            await exchange("GET /healthz", "GET", "/healthz")
            await exchange("no secret", "POST", PATH, data=update_bytes("/start"))
            await exchange(
                "wrong secret",
                "POST",
                PATH,
                headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
                data=update_bytes("/start"),
            )
            await exchange("/start RU", "POST", PATH, headers=secret, data=update_bytes("/start", update_id=1))
            await exchange(
                "/start EN", "POST", PATH, headers=secret, data=update_bytes("/start", language_code="en", update_id=2)
            )
            await exchange("bad JSON", "POST", PATH, headers=secret, data=b"{not json")
            await exchange("oversized body", "POST", PATH, headers=secret, data=io.BytesIO(b"x" * (2 << 20)))
            await exchange("crashing handler", "POST", PATH, headers=secret, data=update_bytes("/crash", update_id=3))
            await exchange(
                "Bot API JSON 500",
                "POST",
                PATH,
                headers=secret,
                data=update_bytes("/start", update_id=4),
                error=(
                    500,
                    "application/json",
                    b'{"ok": false, "error_code": 500, "description": "Internal Server Error"}',
                ),
            )
            await exchange(
                "Bot API HTML 502",
                "POST",
                PATH,
                headers=secret,
                data=update_bytes("/start", update_id=5),
                error=(502, "text/html", b"<html><body>502 Bad Gateway</body></html>"),
            )
            await exchange(
                "Bot API 401",
                "POST",
                PATH,
                headers=secret,
                data=update_bytes("/start", update_id=6),
                error=(401, "application/json", b'{"ok": false, "error_code": 401, "description": "Unauthorized"}'),
            )
            await exchange(
                "flood control 429",
                "POST",
                PATH,
                headers=secret,
                data=update_bytes("/start", update_id=7),
                error=(
                    429,
                    "application/json",
                    b'{"ok": false, "error_code": 429, "description": "Too Many Requests: retry after 7",'
                    b' "parameters": {"retry_after": 7}}',
                ),
            )
            await fake.stop()
            await exchange("Bot API down", "POST", PATH, headers=secret, data=update_bytes("/start", update_id=8))
    finally:
        server.should_exit = True
        await task
        await fake.stop()
    return exchanges, fake


def test_smoke_over_http(settings: Settings, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    exchanges, _ = asyncio.run(run_smoke(settings))
    results = {e.label: e for e in exchanges}

    health = results["GET /healthz"]
    assert health.status == 200
    assert json.loads(health.body)["configured"] is True

    expected = {
        "no secret": (401, None, []),
        "wrong secret": (401, None, []),
        "/start RU": (200, None, ["sendMessage", "setChatMenuButton"]),
        "/start EN": (200, None, ["sendMessage", "setChatMenuButton"]),
        "bad JSON": (200, None, []),
        "oversized body": (413, None, []),
        "crashing handler": (200, None, []),
        "Bot API JSON 500": (503, "5", ["sendMessage"]),
        "Bot API HTML 502": (503, "5", ["sendMessage"]),
        "Bot API 401": (503, "60", ["sendMessage"]),
        "flood control 429": (503, "7", ["sendMessage"]),
        "Bot API down": (503, "5", []),
    }
    actual = {
        label: (results[label].status, results[label].retry_after, results[label].bot_api_calls) for label in expected
    }
    assert actual == expected
    for label in ("/start RU", "/start EN", "bad JSON", "crashing handler"):
        assert results[label].body == b"{}"

    assert_no_leaks(caplog.records, CATALOG["ru"].start, CATALOG["en"].start)
