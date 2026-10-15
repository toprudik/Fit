"""The ASGI app Vercel serves (project dafit-bot, entry api/index.py). See docs/adr/0006 and contract section 3.

Routes: GET/HEAD /healthz and POST /telegram/webhook. Each update is handled to the end before the answer goes out;
nothing runs after it. Every update gets its own Bot and Bot API session, closed before the callable returns.
"""

import enum
import json
import logging
from collections.abc import Awaitable, Callable, Iterable, MutableMapping
from typing import Any, Final

from aiogram import Bot, Dispatcher

from fit_bot.config import (
    HEALTH_PATH,
    WEBHOOK_PATH,
    Settings,
    SettingsError,
    deployment_commit,
    load_settings,
    token_bot_id,
    vercel_env,
)
from fit_bot.dispatcher import build_dispatcher
from fit_bot.webhook import (
    MAX_BODY_BYTES,
    SECRET_HEADER,
    expected_secret,
    header_value,
    make_bot,
    parse_update,
    process_update,
    secret_matches,
)

log = logging.getLogger("fit_bot.webhook")

Scope = MutableMapping[str, Any]
AsgiMessage = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[AsgiMessage]]
Send = Callable[[AsgiMessage], Awaitable[None]]


class _Disconnected(enum.Enum):
    DISCONNECTED = enum.auto()


_DISCONNECTED: Final = _Disconnected.DISCONNECTED
_EMPTY_JSON: Final = b"{}"


class WebhookApp:
    def __init__(
        self,
        *,
        load: Callable[[], Settings] = load_settings,
        bot_factory: Callable[[Settings], Bot] = make_bot,
        dispatcher: Dispatcher | None = None,
    ) -> None:
        self._load = load
        self._bot_factory = bot_factory
        self._dp = dispatcher if dispatcher is not None else build_dispatcher()
        self._loaded = False
        self._settings: Settings | None = None
        self._secret = b""

    def _get_settings(self) -> Settings | None:
        """Loads once per instance and caches success and failure: Vercel applies env changes to new deployments."""
        if not self._loaded:
            self._loaded = True
            try:
                settings = self._load()
            except SettingsError as error:
                log.error("%s", error)  # names only
            else:
                self._secret = expected_secret(settings)
                self._settings = settings
        return self._settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await _lifespan(receive, send)
            return
        if scope["type"] != "http":
            return

        path, method = scope["path"], scope["method"]
        if path == HEALTH_PATH:
            if method in ("GET", "HEAD"):
                await self._health(send, head=method == "HEAD")
            else:
                await _respond(send, 405, headers=((b"allow", b"GET, HEAD"),))
            return
        if path != WEBHOOK_PATH:
            await _respond(send, 404)
            return
        if method != "POST":
            await _respond(send, 405, headers=((b"allow", b"POST"),))
            return

        settings = self._get_settings()
        if settings is None:
            await _respond(send, 500)
            return
        headers = scope["headers"]
        if not secret_matches(header_value(headers, SECRET_HEADER), self._secret):
            log.warning("webhook: rejected a request with a wrong or missing secret token")
            await _respond(send, 401)
            return
        body = await _read_body(headers, receive, MAX_BODY_BYTES)
        if body is _DISCONNECTED:
            return
        if body is None:
            log.warning("webhook: rejected a request body over %d bytes", MAX_BODY_BYTES)
            await _respond(send, 413)
            return
        update = parse_update(body)
        if update is None:
            await _respond(send, 200, body=_EMPTY_JSON)
            return

        bot = self._bot_factory(settings)
        try:
            outcome = await process_update(self._dp, bot, update, settings=settings)
            await _respond(
                send, outcome.status, body=_EMPTY_JSON if outcome.status == 200 else b"", headers=outcome.headers
            )
        finally:
            # After Telegram has its answer and before the callable returns, so it stays inside the invocation.
            await bot.session.close()

    async def _health(self, send: Send, *, head: bool) -> None:
        settings = self._get_settings()
        payload = {
            "configured": settings is not None,
            "commit": deployment_commit(),
            "env": vercel_env(),
            "bot_id": token_bot_id(),
        }
        await _respond(send, 200, body=json.dumps(payload).encode(), head=head)


async def _lifespan(receive: Receive, send: Send) -> None:
    while True:
        message = await receive()
        if message["type"] == "lifespan.startup":
            await send({"type": "lifespan.startup.complete"})
        elif message["type"] == "lifespan.shutdown":
            await send({"type": "lifespan.shutdown.complete"})
            return


async def _read_body(
    headers: Iterable[tuple[bytes, bytes]], receive: Receive, limit: int
) -> bytes | None | _Disconnected:
    """The body, None when it is over the limit (declared or streamed), _DISCONNECTED when the client left."""
    declared = header_value(headers, b"content-length")
    if declared.isdigit() and int(declared) > limit:
        return None
    chunks: list[bytes] = []
    size = 0
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            return _DISCONNECTED
        chunk = message.get("body", b"")
        size += len(chunk)
        if size > limit:
            return None
        chunks.append(chunk)
        if not message.get("more_body", False):
            return b"".join(chunks)


async def _respond(
    send: Send,
    status: int,
    *,
    body: bytes = b"",
    headers: Iterable[tuple[bytes, bytes]] = (),
    head: bool = False,
) -> None:
    """One response. HEAD gets the GET headers without the body."""
    response_headers = [(b"cache-control", b"no-store")]
    if body:
        response_headers.append((b"content-type", b"application/json"))
    response_headers.append((b"content-length", str(len(body)).encode()))
    response_headers.extend(headers)
    await send({"type": "http.response.start", "status": status, "headers": response_headers})
    await send({"type": "http.response.body", "body": b"" if head else body})


#: Module level: builds the Dispatcher at import and reads no environment until the first request.
app: Final = WebhookApp()
