"""`python -m fit_bot setup`: points Telegram at the deployed webhook and syncs the bot profile (contract section 4).

Run by the GitHub Actions workflow "Bot setup", never by a deployment. Before writing anything it checks the bot's
username and probes the deployed function. The report is plain text and passes through redaction of the token and
the webhook secret.
"""

import asyncio
import json
import re
import sys
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final, Literal, TextIO
from urllib.parse import urlsplit, urlunsplit

import aiohttp
from aiogram import Bot, Dispatcher
from aiogram.exceptions import TelegramNetworkError, TelegramRetryAfter
from aiogram.types import BotCommand, MenuButtonWebApp, User

from fit_bot.config import (
    HEALTH_PATH,
    PRODUCTION_BOT_USERNAME,
    WEBHOOK_PATH,
    Settings,
    in_github_actions,
)
from fit_bot.dispatcher import build_dispatcher
from fit_bot.keyboards import app_url, menu_button
from fit_bot.texts import BOT_NAME, CATALOG, COMMAND_NAMES, Texts
from fit_bot.webhook import SECRET_HEADER, describe_error, make_bot

MAX_CONNECTIONS: Final = 10
PROBE_TIMEOUT_SECONDS: Final = 15
SETTLE_SECONDS: Final = 5.0
#: Setup is not latency-bound, so its Bot API calls get more time than the webhook's.
SETUP_API_TIMEOUT: Final = 30.0
#: Pauses before getMe is retried after a network error (three tries in all).
NETWORK_RETRY_DELAYS: Final = (5.0, 15.0)
MAX_PENDING_UPDATES: Final = 10
CHECK_ERROR_WINDOW: Final = timedelta(hours=1)
_PLAIN: Final = re.compile(r"[A-Za-z0-9._-]{1,64}")

Status = Literal["ok", "updated", "unchanged", "differs", "postponed", "failed"]


@dataclass(frozen=True, slots=True)
class Step:
    name: str
    status: Status
    detail: str = ""

    @property
    def failed(self) -> bool:
        return self.status in ("failed", "differs")


def probe_update_body() -> bytes:
    """A group message: no private-chat handler matches, so the deployed bot answers 200 and sends nothing."""
    update = {
        "update_id": 0,
        "message": {
            "message_id": 0,
            "date": int(time.time()),
            "chat": {"id": -1, "type": "group", "title": "DaFit setup probe"},
            "text": "setup probe",
        },
    }
    return json.dumps(update).encode()


async def check_identity(
    bot: Bot, expected_username: str, retry_delays: Sequence[float] = NETWORK_RETRY_DELAYS
) -> tuple[Step, User | None]:
    """getMe; the user is None when the step failed (setup stops then).

    getMe is the first request of a run, so a network error here is retried after each delay: a runner's first
    connection to Telegram can stall, and nothing has been written yet.
    """
    me: User | None = None
    for attempt, delay in enumerate((*retry_delays, None)):
        try:
            me = await bot.get_me()
            break
        except TelegramNetworkError as error:
            if delay is None:
                tries = f"{attempt + 1} tries" if attempt else "1 try"
                return Step("bot", "failed", f"{describe_error(error)} after {tries}"), None
            await asyncio.sleep(delay)
        except Exception as error:
            return Step("bot", "failed", describe_error(error)), None
    assert me is not None
    username = me.username or ""
    if username.lower() != expected_username.lower():
        return Step("bot", "failed", f"the token belongs to @{username}, expected @{expected_username}"), None
    return Step("bot", "ok", f"@{username}, id {me.id}"), me


async def probe_deployment(
    settings: Settings,
    http: aiohttp.ClientSession,
    *,
    expected_bot_id: int,
    bot_username: str = PRODUCTION_BOT_USERNAME,
) -> list[Step]:
    """GET /healthz, the webhook without and with the secret. Redirects are not followed.

    The secret goes out only after the origin has shown it is this bot's deployment: /healthz names the same bot and
    the webhook refuses a request without the secret. This catches a wrong or reassigned domain. A deliberate
    impostor can copy the public bot id, so it is no defence against one.
    """
    origin = _origin(settings)
    health = await _probe_health(http, origin + HEALTH_PATH, expected_bot_id, bot_username)
    without_secret = await _probe_without_secret(http, origin + WEBHOOK_PATH)
    if health.failed or without_secret.failed:
        with_secret = Step("webhook with secret", "failed", "skipped: the deployment was not verified")
    else:
        with_secret = await _probe_with_secret(http, origin + WEBHOOK_PATH, settings.webhook_secret())
    return [health, without_secret, with_secret]


async def _probe_health(http: aiohttp.ClientSession, url: str, expected_bot_id: int, bot_username: str) -> Step:
    name = "deployment /healthz"
    try:
        async with http.get(url, allow_redirects=False) as response:
            status = response.status
            data: Any = await response.json(content_type=None) if status == 200 else None
    except (aiohttp.ClientError, TimeoutError, ValueError) as error:
        return Step(name, "failed", f"could not read {url}: {type(error).__name__}")
    if 300 <= status < 400:
        return Step(name, "failed", "the production domain redirects (Deployment Protection covers it?)")
    if status != 200 or not isinstance(data, dict):
        return Step(name, "failed", f"expected 200 with JSON, got {status}")
    if data.get("configured") is not True:
        return Step(
            name,
            "failed",
            "the deployed bot has no valid settings: set TELEGRAM_BOT_TOKEN and WEBAPP_URL for Production in Vercel "
            "and redeploy",
        )
    bot_id = data.get("bot_id")
    if bot_id != expected_bot_id:
        # Only an int is shown: the answer may come from someone else's server and must not shape the log.
        owner = f"bot {bot_id}" if type(bot_id) is int else "another bot"
        return Step(
            name,
            "failed",
            f"the token in Vercel belongs to {owner}, this token to {expected_bot_id}: put the "
            f"@{bot_username} token into Vercel dafit-bot Production and redeploy",
        )
    commit = _plain(data.get("commit"))
    commit_text = commit[:7] if commit else "unknown"
    return Step(name, "ok", f"configured, commit {commit_text}, env {_plain(data.get('env')) or 'unknown'}")


async def _probe_without_secret(http: aiohttp.ClientSession, url: str) -> Step:
    name = "webhook without secret"
    try:
        status = await _post(http, url, b"{}", {})
    except (aiohttp.ClientError, TimeoutError) as error:
        return Step(name, "failed", f"could not reach {url}: {type(error).__name__}")
    if status == 401:
        return Step(name, "ok", "401")
    if 200 <= status < 300:
        return Step(name, "failed", "the webhook accepts requests without the secret")
    return Step(name, "failed", f"expected 401, got {status}")


async def _probe_with_secret(http: aiohttp.ClientSession, url: str, secret: str) -> Step:
    name = "webhook with secret"
    try:
        status = await _post(http, url, probe_update_body(), {SECRET_HEADER.decode(): secret})
    except (aiohttp.ClientError, TimeoutError) as error:
        return Step(name, "failed", f"could not reach {url}: {type(error).__name__}")
    if status == 200:
        return Step(name, "ok", "200")
    if status == 401:
        return Step(
            name,
            "failed",
            "the deployed bot rejects the secret derived from this token: the token in GitHub and in Vercel differ, "
            "or TELEGRAM_WEBHOOK_SECRET is set in only one of them",
        )
    if status == 500:
        return Step(name, "failed", "the deployed bot has invalid settings")
    return Step(name, "failed", f"expected 200, got {status}")


async def _post(http: aiohttp.ClientSession, url: str, body: bytes, headers: dict[str, str]) -> int:
    async with http.post(
        url, data=body, headers={"Content-Type": "application/json", **headers}, allow_redirects=False
    ) as response:
        return response.status


async def register_webhook(bot: Bot, dp: Dispatcher, settings: Settings) -> Step:
    """setWebhook on every run: the secret cannot be read back, and Telegram treats identical values as a no-op."""
    url = settings.webhook_url()
    allowed = dp.resolve_used_update_types()
    try:
        await bot.set_webhook(
            url=url,
            secret_token=settings.webhook_secret(),
            allowed_updates=allowed,
            max_connections=MAX_CONNECTIONS,
            drop_pending_updates=False,
        )
    except Exception as error:
        return Step("setWebhook", "failed", describe_error(error))
    return Step(
        "setWebhook", "updated", f"{url}, allowed_updates={','.join(allowed)}, max_connections={MAX_CONNECTIONS}"
    )


async def sync_profile(bot: Bot, settings: Settings, *, set_name: bool, dry_run: bool = False) -> list[Step]:
    """Commands, descriptions, name and the default menu button: read first, write only on difference.

    RU is the default language (no language_code), EN is stored for language_code "en". The name has no EN variant.
    """
    webapp = str(settings.webapp_url)
    ru = CATALOG["ru"]
    languages: tuple[tuple[str, str | None, Texts], ...] = (("default", None, ru), ("en", "en", CATALOG["en"]))
    steps = [await _sync_commands(bot, *language, dry_run=dry_run) for language in languages]
    steps += [await _sync_description(bot, *language, dry_run=dry_run) for language in languages]
    steps += [await _sync_short_description(bot, *language, dry_run=dry_run) for language in languages]
    if set_name:

        async def read_name() -> str:
            return (await bot.get_my_name()).name

        steps.append(
            await _sync_item(
                "name (default)",
                read=read_name,
                desired=BOT_NAME,
                write=lambda: bot.set_my_name(name=BOT_NAME),
                dry_run=dry_run,
            )
        )

    async def read_menu_button() -> tuple[str, ...]:
        button = await bot.get_chat_menu_button()
        if isinstance(button, MenuButtonWebApp):
            return ("web_app", button.text, button.web_app.url)
        return (button.type,)

    steps.append(
        await _sync_item(
            "menu button (default)",
            read=read_menu_button,
            desired=("web_app", ru.menu_button, app_url(webapp, "bot_menu")),
            write=lambda: bot.set_chat_menu_button(menu_button=menu_button(webapp, ru)),
            dry_run=dry_run,
        )
    )
    return steps


async def _sync_commands(bot: Bot, label: str, language_code: str | None, texts: Texts, *, dry_run: bool) -> Step:
    descriptions = {"start": texts.command_start, "help": texts.command_help}
    commands = [BotCommand(command=name, description=descriptions[name]) for name in COMMAND_NAMES]

    async def read() -> list[tuple[str, str]]:
        current = await bot.get_my_commands(language_code=language_code)
        return [(command.command, command.description) for command in current]

    return await _sync_item(
        f"commands ({label})",
        read=read,
        desired=[(command.command, command.description) for command in commands],
        write=lambda: bot.set_my_commands(commands=commands, language_code=language_code),
        dry_run=dry_run,
    )


async def _sync_description(bot: Bot, label: str, language_code: str | None, texts: Texts, *, dry_run: bool) -> Step:
    async def read() -> str:
        return (await bot.get_my_description(language_code=language_code)).description

    return await _sync_item(
        f"description ({label})",
        read=read,
        desired=texts.description,
        write=lambda: bot.set_my_description(description=texts.description, language_code=language_code),
        dry_run=dry_run,
    )


async def _sync_short_description(
    bot: Bot, label: str, language_code: str | None, texts: Texts, *, dry_run: bool
) -> Step:
    async def read() -> str:
        return (await bot.get_my_short_description(language_code=language_code)).short_description

    return await _sync_item(
        f"short description ({label})",
        read=read,
        desired=texts.short_description,
        write=lambda: bot.set_my_short_description(
            short_description=texts.short_description, language_code=language_code
        ),
        dry_run=dry_run,
    )


async def _sync_item(
    name: str,
    *,
    read: Callable[[], Awaitable[Any]],
    desired: Any,
    write: Callable[[], Awaitable[Any]],
    dry_run: bool,
) -> Step:
    try:
        if await read() == desired:
            return Step(name, "unchanged")
        if dry_run:
            return Step(name, "differs", "not what DaFit sets: run Bot setup in mode setup")
        await write()
    except TelegramRetryAfter as error:
        return Step(name, "postponed", f"flood control, retry in {error.retry_after} s")
    except Exception as error:
        return Step(name, "failed", describe_error(error))
    return Step(name, "updated")


async def verify_webhook(
    bot: Bot, dp: Dispatcher, settings: Settings, *, check_only: bool, errors_since: datetime
) -> list[Step]:
    """Reads getWebhookInfo once: URL, parameters, pending updates and delivery errors."""
    try:
        info = await bot.get_webhook_info()
    except Exception as error:
        return [Step("webhook info", "failed", describe_error(error))]

    steps: list[Step] = []
    expected_url = settings.webhook_url()
    if not info.url:
        steps.append(Step("webhook url", "failed", "no webhook is set"))
    elif info.url != expected_url:
        steps.append(Step("webhook url", "failed", f"{info.url}, expected {expected_url}"))
    else:
        steps.append(Step("webhook url", "ok", info.url))

    expected_updates = sorted(dp.resolve_used_update_types())
    actual_updates = sorted(info.allowed_updates or [])
    problems = []
    if actual_updates != expected_updates:
        problems.append(f"allowed_updates={','.join(actual_updates) or 'all'}, expected {','.join(expected_updates)}")
    if info.max_connections != MAX_CONNECTIONS:
        problems.append(f"max_connections={info.max_connections}, expected {MAX_CONNECTIONS}")
    if info.has_custom_certificate:
        problems.append("a custom certificate is set")
    if problems:
        steps.append(Step("webhook settings", "failed", "; ".join(problems)))
    else:
        steps.append(
            Step(
                "webhook settings",
                "ok",
                f"allowed_updates={','.join(actual_updates)}, max_connections={MAX_CONNECTIONS}",
            )
        )

    steps.append(
        _delivery_step(
            info.pending_update_count,
            info.last_error_date,
            info.last_error_message,
            check_only=check_only,
            errors_since=errors_since,
        )
    )
    return steps


def _delivery_step(
    pending: int, last_error: datetime | None, message: str | None, *, check_only: bool, errors_since: datetime
) -> Step:
    """Setup: any delivery error since setWebhook fails. Check: only a recent error that left updates pending fails."""
    name = "webhook info"
    error_text = message or "no message"
    if pending > MAX_PENDING_UPDATES:
        return Step(name, "failed", f"updates are piling up: pending {pending}")
    recent = last_error is not None and last_error >= errors_since
    if recent and (not check_only or pending > 0):
        return Step(name, "failed", f"Telegram cannot deliver updates: {error_text}")
    if check_only and last_error is not None:
        return Step(name, "ok", f"pending {pending}, last error {_iso(last_error)}: {error_text}")
    return Step(name, "ok", f"pending {pending}, no delivery errors since {_iso(errors_since)}")


async def run_setup(
    settings: Settings,
    *,
    check_only: bool,
    expected_username: str = PRODUCTION_BOT_USERNAME,
    bot: Bot | None = None,
    http: aiohttp.ClientSession | None = None,
    settle_seconds: float = SETTLE_SECONDS,
    network_retry_delays: Sequence[float] = NETWORK_RETRY_DELAYS,
    out: TextIO = sys.stdout,
) -> int:
    """Runs every step of section 4.1, prints the report and returns the exit code (0 ok, 1 a step failed)."""
    token = settings.telegram_bot_token.get_secret_value()
    secret = settings.webhook_secret()
    if in_github_actions():
        # GitHub masks secrets.* itself; the derived secret is not a GitHub secret.
        out.write(f"::add-mask::{secret}\n")
        out.flush()

    own_bot = bot is None
    own_http = http is None
    if bot is None:
        bot = make_bot(settings, timeout=SETUP_API_TIMEOUT)
    if http is None:
        http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=PROBE_TIMEOUT_SECONDS))
    dp = build_dispatcher()
    steps: list[Step] = []
    try:
        await _run_steps(
            steps, bot, dp, http, settings, check_only, expected_username, settle_seconds, network_retry_delays
        )
    finally:
        if own_http:
            await http.close()
        if own_bot:
            await bot.session.close()

    out.write(
        render_report(steps, mode="check" if check_only else "setup", redact=[token, token.split(":", 1)[1], secret])
    )
    out.flush()
    return 1 if any(step.failed for step in steps) else 0


async def _run_steps(
    steps: list[Step],
    bot: Bot,
    dp: Dispatcher,
    http: aiohttp.ClientSession,
    settings: Settings,
    check_only: bool,
    expected_username: str,
    settle_seconds: float,
    network_retry_delays: Sequence[float],
) -> None:
    identity, me = await check_identity(bot, expected_username, network_retry_delays)
    steps.append(identity)
    if me is None:
        return
    probes = await probe_deployment(
        settings, http, expected_bot_id=me.id, bot_username=me.username or expected_username
    )
    steps.extend(probes)
    if any(step.failed for step in probes):
        return  # never point Telegram at a function that rejects it or holds another bot's token

    if check_only:
        steps.extend(await sync_profile(bot, settings, set_name=True, dry_run=True))
        errors_since = datetime.now(UTC) - CHECK_ERROR_WINDOW
    else:
        steps.append(await register_webhook(bot, dp, settings))
        # An update rejected with the old secret before this moment is not this run's fault.
        errors_since = datetime.now(UTC)
        steps.extend(await sync_profile(bot, settings, set_name=True))
        if settle_seconds > 0:
            await asyncio.sleep(settle_seconds)  # let delivery errors after the change show up
    steps.extend(await verify_webhook(bot, dp, settings, check_only=check_only, errors_since=errors_since))


def render_report(steps: Sequence[Step], *, mode: str, redact: Sequence[str]) -> str:
    lines = [f"DaFit bot setup, mode {mode}"]
    # One line per step: a line break in a detail could start a GitHub workflow command such as ::error::.
    lines.extend(f"  {step.name:<28} {step.status:<10} {' '.join(step.detail.split())}".rstrip() for step in steps)
    lines.append(f"Result: {'FAILED' if any(step.failed for step in steps) else 'OK'}")
    text = "\n".join(lines) + "\n"
    for value in sorted((v for v in redact if v), key=len, reverse=True):
        text = text.replace(value, "[redacted]")
    return text


def _plain(value: object) -> str | None:
    """A short value from /healthz shown only when it is plain letters, digits, dots, dashes or underscores."""
    if isinstance(value, str) and _PLAIN.fullmatch(value):
        return value
    return None


def _origin(settings: Settings) -> str:
    parts = urlsplit(settings.webhook_url())
    return urlunsplit((parts.scheme, parts.netloc, "", "", ""))


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
