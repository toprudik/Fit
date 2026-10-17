import asyncio
import io
import json
import socket
import time
from typing import Any

import aiohttp
import pytest
from aiogram import Bot
from aiogram.exceptions import TelegramNetworkError, TelegramRetryAfter, TelegramUnauthorizedError
from aiogram.methods import (
    GetChatMenuButton,
    GetMe,
    GetMyCommands,
    GetMyDescription,
    GetMyName,
    GetMyShortDescription,
    GetWebhookInfo,
    SetChatMenuButton,
    SetMyCommands,
    SetMyDescription,
    SetMyName,
    SetMyShortDescription,
    SetWebhook,
    TelegramMethod,
)
from aiohttp import web
from pydantic import HttpUrl, SecretStr

from fakes import BOT_ID, TOKEN, TOKEN_SECRET_PART, RecordingSession, webhook_secret
from fit_bot.bot_setup import Step, probe_update_body, render_report, run_setup
from fit_bot.config import PRODUCTION_BOT_USERNAME, Settings, derive_webhook_secret
from fit_bot.texts import CATALOG

OVERRIDE = "override_secret_for-tests-0123"


class FakeTelegram(RecordingSession):
    """A stateful Bot API: profile and webhook writes are visible to later reads."""

    def __init__(self, *, username: str = PRODUCTION_BOT_USERNAME) -> None:
        super().__init__()
        self.me = {"id": BOT_ID, "is_bot": True, "first_name": "DaFit", "username": username}
        self.commands: dict[str | None, list[dict[str, str]]] = {None: [], "en": []}
        self.description: dict[str | None, str] = {None: "", "en": ""}
        self.short_description: dict[str | None, str] = {None: "", "en": ""}
        self.name = ""
        self.menu_button: dict[str, Any] = {"type": "commands"}
        self.webhook: dict[str, Any] = {"url": "", "has_custom_certificate": False, "pending_update_count": 0}
        #: Merged into getWebhookInfo answers, for states setWebhook cannot produce.
        self.webhook_override: dict[str, Any] = {}
        #: Raised by the next getMe calls, one per call, before getMe answers normally.
        self.get_me_failures: list[Exception] = []

    async def make_request(self, bot: Bot, method: TelegramMethod[Any], timeout: int | None = None) -> Any:  # noqa: ASYNC109 (BaseSession signature)
        if isinstance(method, GetMe) and self.get_me_failures:
            self.requests.append(method)
            raise self.get_me_failures.pop(0)
        return await super().make_request(bot, method, timeout)

    def result_for(self, method: TelegramMethod[Any]) -> Any:
        match method:
            case GetMe():
                return self.me
            case GetMyCommands():
                return self.commands[method.language_code]
            case SetMyCommands():
                self.commands[method.language_code] = [c.model_dump(exclude_none=True) for c in method.commands]
            case GetMyDescription():
                return {"description": self.description[method.language_code]}
            case SetMyDescription():
                self.description[method.language_code] = method.description or ""
            case GetMyShortDescription():
                return {"short_description": self.short_description[method.language_code]}
            case SetMyShortDescription():
                self.short_description[method.language_code] = method.short_description or ""
            case GetMyName():
                return {"name": self.name}
            case SetMyName():
                self.name = method.name or ""
            case GetChatMenuButton():
                return self.menu_button
            case SetChatMenuButton():
                self.menu_button = method.menu_button.model_dump(exclude_none=True)  # type: ignore[union-attr]
            case SetWebhook():
                self.webhook.update(
                    url=method.url, allowed_updates=method.allowed_updates, max_connections=method.max_connections
                )
            case GetWebhookInfo():
                return {**self.webhook, **self.webhook_override}
        return True

    def writes(self) -> list[str]:
        return [name for name in self.names() if name.startswith(("Set", "Delete"))]


class Deployment:
    """A stub of the deployed function for the probes; behaves like the real one unless told otherwise."""

    def __init__(self, secret: str) -> None:
        self.secret = secret
        self.health: tuple[int, Any] = (
            200,
            {"configured": True, "commit": "0123456789abcdef", "env": "production", "bot_id": BOT_ID},
        )
        self.unauthenticated_status: int | None = None
        self.authenticated_status: int | None = None
        self.posts: list[tuple[bool, bytes]] = []

    async def healthz(self, request: web.Request) -> web.StreamResponse:
        status, payload = self.health
        if 300 <= status < 400:
            return web.Response(status=status, headers={"Location": "https://vercel.com/sso"})
        return web.json_response(payload, status=status)

    async def webhook(self, request: web.Request) -> web.Response:
        body = await request.read()
        authenticated = request.headers.get("X-Telegram-Bot-Api-Secret-Token") == self.secret
        self.posts.append((authenticated, body))
        if authenticated:
            return web.Response(status=self.authenticated_status or 200, body=b"{}")
        return web.Response(status=self.unauthenticated_status or 401)


def make_settings(origin: str, *, override: str | None = None) -> Settings:
    """model_construct: the stub runs on http://127.0.0.1, which the https validator would reject."""
    return Settings.model_construct(
        telegram_bot_token=SecretStr(TOKEN),
        webapp_url=HttpUrl("https://app.example"),
        bot_mode="polling",
        bot_webhook_url=HttpUrl(origin),
        telegram_webhook_secret=SecretStr(override) if override else None,
        port=8080,
    )


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class Harness:
    def __init__(self, *, override: str | None = None, username: str = PRODUCTION_BOT_USERNAME) -> None:
        self.telegram = FakeTelegram(username=username)
        self.override = override
        self.deployment = Deployment(override or webhook_secret())
        self.out = io.StringIO()
        self.port = _free_port()  # the same origin in every run, as in production

    def run(self, *, check_only: bool = False, expected_username: str = PRODUCTION_BOT_USERNAME) -> int:
        self.out = io.StringIO()

        async def go() -> int:
            app = web.Application()
            app.router.add_get("/healthz", self.deployment.healthz)
            app.router.add_post("/telegram/webhook", self.deployment.webhook)
            runner = web.AppRunner(app, access_log=None)
            await runner.setup()
            site = web.TCPSite(runner, "127.0.0.1", self.port)
            await site.start()
            try:
                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as http:
                    return await run_setup(
                        make_settings(f"http://127.0.0.1:{self.port}", override=self.override),
                        check_only=check_only,
                        expected_username=expected_username,
                        bot=Bot(TOKEN, session=self.telegram),
                        http=http,
                        settle_seconds=0,
                        network_retry_delays=(0, 0),
                        out=self.out,
                    )
            finally:
                await runner.cleanup()

        return asyncio.run(go())

    @property
    def report(self) -> str:
        return self.out.getvalue()

    def line(self, name: str) -> str:
        (line,) = [line for line in self.report.splitlines() if line.startswith(f"  {name} ")]
        return line

    def status(self, name: str) -> str:
        return self.line(name)[31:41].strip()

    def detail(self, name: str) -> str:
        return self.line(name)[42:]


@pytest.fixture
def harness() -> Harness:
    return Harness()


def test_happy_path(harness: Harness) -> None:
    assert harness.run() == 0, harness.report
    assert harness.telegram.names() == [
        "GetMe",
        "SetWebhook",
        "GetMyCommands",
        "SetMyCommands",
        "GetMyCommands",
        "SetMyCommands",
        "GetMyDescription",
        "SetMyDescription",
        "GetMyDescription",
        "SetMyDescription",
        "GetMyShortDescription",
        "SetMyShortDescription",
        "GetMyShortDescription",
        "SetMyShortDescription",
        "GetMyName",
        "SetMyName",
        "GetChatMenuButton",
        "SetChatMenuButton",
        "GetWebhookInfo",
    ]
    (set_webhook,) = harness.telegram.of(SetWebhook)
    assert set_webhook.url.endswith("/telegram/webhook")
    assert set_webhook.secret_token == webhook_secret()
    assert set_webhook.allowed_updates == ["callback_query", "message"]
    assert set_webhook.max_connections == 10
    assert set_webhook.drop_pending_updates is False
    # RU is the default language (no language_code), EN is "en"; the name has no language.
    assert [m.language_code for m in harness.telegram.of(SetMyCommands)] == [None, "en"]
    assert [m.language_code for m in harness.telegram.of(SetMyDescription)] == [None, "en"]
    assert [m.language_code for m in harness.telegram.of(SetMyShortDescription)] == [None, "en"]
    (set_name,) = harness.telegram.of(SetMyName)
    assert (set_name.name, set_name.language_code) == ("DaFit", None)
    ru, en = CATALOG["ru"], CATALOG["en"]
    assert harness.telegram.commands[None] == [
        {"command": "start", "description": ru.command_start},
        {"command": "help", "description": ru.command_help},
    ]
    assert harness.telegram.commands["en"][1] == {"command": "help", "description": en.command_help}
    assert harness.telegram.description == {None: ru.description, "en": en.description}
    assert harness.telegram.short_description == {None: ru.short_description, "en": en.short_description}
    (menu,) = harness.telegram.of(SetChatMenuButton)
    assert menu.chat_id is None
    assert menu.menu_button.text == "DaFit"  # type: ignore[union-attr]
    assert menu.menu_button.web_app.url == "https://app.example/?source=bot_menu"  # type: ignore[union-attr]
    # probes: one without the secret, one with it (a group message no handler answers)
    assert [authenticated for authenticated, _ in harness.deployment.posts] == [False, True]
    probe = json.loads(harness.deployment.posts[1][1])
    assert probe["update_id"] == 0
    assert probe["message"]["chat"]["type"] == "group"  # no private-chat handler answers it
    assert probe["message"]["text"] == "setup probe"
    assert json.loads(probe_update_body())["message"]["chat"] == probe["message"]["chat"]
    report = harness.report
    assert report.startswith("DaFit bot setup, mode setup\n")
    assert report.endswith("Result: OK\n")
    assert "bot                          ok         @fitconnection_bot, id 123456" in report
    assert "configured, commit 0123456, env production" in harness.line("deployment /healthz")
    assert (harness.status("webhook without secret"), harness.detail("webhook without secret")) == ("ok", "401")
    assert (harness.status("webhook with secret"), harness.detail("webhook with secret")) == ("ok", "200")
    assert "allowed_updates=callback_query,message, max_connections=10" in harness.line("setWebhook")
    assert "pending 0, no delivery errors since" in harness.line("webhook info")


def test_second_run_changes_nothing_in_the_profile(harness: Harness) -> None:
    assert harness.run() == 0
    first = len(harness.telegram.requests)
    assert harness.run() == 0, harness.report
    second = harness.telegram.names()[first:]
    assert [name for name in second if name.startswith("Set")] == ["SetWebhook"]
    for item in ("commands (default)", "commands (en)", "description (en)", "name (default)", "menu button (default)"):
        assert harness.status(item) == "unchanged"


def test_username_mismatch_stops_before_anything(harness: Harness) -> None:
    harness.telegram.me["username"] = "someone_else_bot"
    assert harness.run() == 1
    assert harness.telegram.names() == ["GetMe"]
    assert harness.deployment.posts == []
    assert "the token belongs to @someone_else_bot, expected @fitconnection_bot" in harness.report
    assert harness.report.endswith("Result: FAILED\n")


def network_error(cause: Exception) -> TelegramNetworkError:
    """As aiogram raises it: wrapping the client error, whose text can hold the token URL."""
    try:
        raise TelegramNetworkError(
            GetMe(), f"{type(cause).__name__}: https://api.telegram.org/bot{TOKEN}/getMe"
        ) from cause
    except TelegramNetworkError as error:
        return error


def test_get_me_is_retried_after_network_errors(harness: Harness) -> None:
    harness.telegram.get_me_failures = [network_error(TimeoutError()), network_error(ConnectionResetError())]
    assert harness.run() == 0, harness.report
    assert harness.telegram.names()[:3] == ["GetMe", "GetMe", "GetMe"]
    assert harness.status("bot") == "ok"


def test_get_me_gives_up_after_three_tries(harness: Harness) -> None:
    harness.telegram.get_me_failures = [network_error(TimeoutError()) for _ in range(3)]
    assert harness.run() == 1
    assert harness.telegram.names() == ["GetMe", "GetMe", "GetMe"]
    assert harness.deployment.posts == []
    assert (harness.status("bot"), harness.detail("bot")) == (
        "failed",
        "TelegramNetworkError (TimeoutError) after 3 tries",
    )
    assert TOKEN not in harness.report
    assert TOKEN_SECRET_PART not in harness.report


def test_other_get_me_errors_are_not_retried(harness: Harness) -> None:
    harness.telegram.fail_on[GetMe] = TelegramUnauthorizedError(GetMe(), "Unauthorized")
    assert harness.run() == 1
    assert harness.telegram.names() == ["GetMe"]
    assert harness.detail("bot") == "TelegramUnauthorizedError: Unauthorized"


def test_expected_username_is_case_insensitive(harness: Harness) -> None:
    harness.telegram.me["username"] = "FitConnection_Bot"
    assert harness.run() == 0, harness.report


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (
            lambda d: setattr(d, "health", (200, {"configured": False, "commit": None, "env": None, "bot_id": None})),
            "the deployed bot has no valid settings",
        ),
        (lambda d: setattr(d, "health", (302, None)), "the production domain redirects"),
        (lambda d: setattr(d, "unauthenticated_status", 200), "the webhook accepts requests without the secret"),
        (
            lambda d: setattr(d, "authenticated_status", 401),
            "the deployed bot rejects the secret derived from this token",
        ),
        (lambda d: setattr(d, "authenticated_status", 500), "the deployed bot has invalid settings"),
    ],
    ids=["unconfigured", "redirect", "no-secret-accepted", "secret-rejected", "invalid-settings"],
)
def test_failed_probe_stops_before_writing(harness: Harness, change: Any, message: str) -> None:
    change(harness.deployment)
    assert harness.run() == 1
    assert harness.telegram.writes() == []
    assert harness.telegram.names() == ["GetMe"]
    assert message in harness.report


def test_another_bots_token_in_vercel_is_caught_with_the_override_set() -> None:
    harness = Harness(override=OVERRIDE)  # the override secret would match, so only the bot id can tell
    harness.deployment.health = (200, {"configured": True, "commit": "abc", "env": "production", "bot_id": 999})
    assert harness.run() == 1
    assert (
        "the token in Vercel belongs to bot 999, this token to 123456: put the @fitconnection_bot token"
        in harness.report
    )
    assert harness.telegram.writes() == []
    assert [authenticated for authenticated, _ in harness.deployment.posts] == [False]


@pytest.mark.parametrize(
    "change",
    [
        lambda d: setattr(d, "health", (404, {"error": "DEPLOYMENT_NOT_FOUND"})),
        lambda d: setattr(d, "health", (200, {"configured": True, "commit": None, "env": None, "bot_id": 999})),
        lambda d: setattr(d, "health", (200, {"configured": False, "commit": None, "env": None, "bot_id": None})),
        lambda d: setattr(d, "health", (302, None)),
        lambda d: setattr(d, "unauthenticated_status", 200),
        lambda d: setattr(d, "unauthenticated_status", 404),
    ],
    ids=["health-404", "other-bot", "unconfigured", "redirect", "no-secret-accepted", "no-secret-404"],
)
def test_unverified_deployment_never_gets_the_secret(harness: Harness, change: Any) -> None:
    change(harness.deployment)
    assert harness.run() == 1
    assert [authenticated for authenticated, _ in harness.deployment.posts] == [False]
    assert (harness.status("webhook with secret"), harness.detail("webhook with secret")) == (
        "failed",
        "skipped: the deployment was not verified",
    )
    assert harness.telegram.writes() == []


def test_values_from_healthz_are_not_copied_into_the_report(harness: Harness) -> None:
    forged = "\n::error title=Bot setup::forged"
    harness.deployment.health = (
        200,
        {"configured": True, "commit": f"0123456{forged}", "env": f"production{forged}", "bot_id": BOT_ID},
    )
    assert harness.run() == 0, harness.report
    assert "configured, commit unknown, env unknown" in harness.line("deployment /healthz")
    harness.deployment.health = (
        200,
        {"configured": True, "commit": "0123456", "env": "production", "bot_id": f"1{forged}"},
    )
    assert harness.run() == 1
    assert "the token in Vercel belongs to another bot, this token to 123456" in harness.line("deployment /healthz")
    assert "forged" not in harness.report
    assert not [line for line in harness.report.splitlines() if line.lstrip().startswith("::")]


def test_override_secret_is_used(harness: Harness) -> None:
    harness = Harness(override=OVERRIDE)
    assert harness.run() == 0, harness.report
    assert harness.telegram.of(SetWebhook)[0].secret_token == OVERRIDE
    assert OVERRIDE not in harness.report


def test_check_only_writes_nothing(harness: Harness) -> None:
    assert harness.run() == 0
    first = len(harness.telegram.requests)
    assert harness.run(check_only=True) == 0, harness.report
    assert harness.report.startswith("DaFit bot setup, mode check\n")
    assert [name for name in harness.telegram.names()[first:] if name.startswith(("Set", "Delete"))] == []


def test_check_only_on_a_fresh_bot_reports_differences(harness: Harness) -> None:
    assert harness.run(check_only=True) == 1
    assert harness.telegram.writes() == []
    assert harness.status("commands (default)") == "differs"
    assert "no webhook is set" in harness.line("webhook url")


def test_check_finds_a_drifted_menu_button(harness: Harness) -> None:
    assert harness.run() == 0
    harness.telegram.menu_button = {
        "type": "web_app",
        "text": "Открыть DaFit",
        "web_app": {"url": "https://old.example/?source=bot_menu"},
    }
    assert harness.run(check_only=True) == 1
    assert harness.status("menu button (default)") == "differs"
    assert 'now web_app "Открыть DaFit"' in harness.line("menu button (default)")
    assert "old.example" not in harness.report


def test_check_names_a_menu_button_of_another_type(harness: Harness) -> None:
    assert harness.run() == 0
    harness.telegram.menu_button = {"type": "commands"}
    assert harness.run(check_only=True) == 1
    assert "now commands, not what DaFit sets" in harness.line("menu button (default)")


@pytest.mark.parametrize(
    ("override", "line", "message"),
    [
        ({"url": "https://elsewhere.example/hook"}, "webhook url", "https://elsewhere.example/hook, expected"),
        (
            {"allowed_updates": ["message"]},
            "webhook settings",
            "allowed_updates=message, expected callback_query,message",
        ),
        ({"max_connections": 40}, "webhook settings", "max_connections=40, expected 10"),
        ({"has_custom_certificate": True}, "webhook settings", "a custom certificate is set"),
        ({"pending_update_count": 11}, "webhook info", "updates are piling up: pending 11"),
        (
            {"last_error_date": int(time.time()) + 60, "last_error_message": "Wrong response from the webhook: 401"},
            "webhook info",
            "Telegram cannot deliver updates: Wrong response from the webhook: 401",
        ),
    ],
    ids=["url", "allowed-updates", "max-connections", "certificate", "pending", "error-after-setwebhook"],
)
def test_verification_failures(harness: Harness, override: dict[str, Any], line: str, message: str) -> None:
    harness.telegram.webhook_override = override
    assert harness.run() == 1
    assert harness.status(line) == "failed"
    assert message in harness.line(line)


def test_error_before_setwebhook_is_not_this_runs_fault(harness: Harness) -> None:
    harness.telegram.webhook_override = {
        "last_error_date": int(time.time()) - 600,
        "last_error_message": "Wrong response from the webhook: 401 Unauthorized",
    }
    assert harness.run() == 0, harness.report
    assert "no delivery errors since" in harness.line("webhook info")


@pytest.mark.parametrize(
    ("age_seconds", "pending", "code"),
    [(300, 0, 0), (300, 2, 1), (7200, 2, 0)],
    ids=["recent-recovered", "recent-pending", "old"],
)
def test_check_mode_delivery_errors(harness: Harness, age_seconds: int, pending: int, code: int) -> None:
    assert harness.run() == 0
    harness.telegram.webhook_override = {
        "last_error_date": int(time.time()) - age_seconds,
        "last_error_message": "Connection timed out",
        "pending_update_count": pending,
    }
    assert harness.run(check_only=True) == code, harness.report
    line = harness.line("webhook info")
    if code:
        assert "Telegram cannot deliver updates: Connection timed out" in line
    else:
        assert f"pending {pending}, last error " in line and "Connection timed out" in line


def test_flood_control_postpones_without_failing(harness: Harness) -> None:
    harness.telegram.fail_on[SetMyName] = TelegramRetryAfter(SetMyName(name="DaFit"), "Too Many Requests", 3600)
    assert harness.run() == 0, harness.report
    assert (harness.status("name (default)"), harness.detail("name (default)")) == (
        "postponed",
        "flood control, retry in 3600 s",
    )


def test_failed_setwebhook_fails_the_run_but_reports_the_rest(harness: Harness) -> None:
    from aiogram.exceptions import TelegramBadRequest

    harness.telegram.fail_on[SetWebhook] = TelegramBadRequest(
        SetWebhook(url="x"), "Bad Request: bad webhook: Failed to resolve host"
    )
    assert harness.run() == 1
    assert "TelegramBadRequest: Bad Request: bad webhook: Failed to resolve host" in harness.line("setWebhook")
    assert harness.status("commands (default)") == "updated"
    assert "no webhook is set" in harness.line("webhook url")


def test_github_actions_masks_the_secret_first(harness: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert harness.run() == 0
    first, *rest = harness.report.splitlines()
    assert first == f"::add-mask::{webhook_secret()}"
    assert webhook_secret() not in "\n".join(rest)


def test_report_never_contains_secrets(harness: Harness) -> None:
    harness.run()
    harness.run(check_only=True)
    harness.telegram.me["username"] = "x_bot"
    harness.run()
    for secret in (TOKEN, TOKEN_SECRET_PART, webhook_secret(), derive_webhook_secret(TOKEN)):
        assert secret not in harness.report


def test_render_report_keeps_one_line_per_step() -> None:
    steps = [Step("webhook info", "failed", "Telegram cannot deliver updates: a\r\n::error::forged\nb")]
    report = render_report(steps, mode="setup", redact=[])
    assert report.splitlines() == [
        "DaFit bot setup, mode setup",
        "  webhook info                 failed     Telegram cannot deliver updates: a ::error::forged b",
        "Result: FAILED",
    ]


def test_render_report_redacts() -> None:
    steps = [Step("bot", "failed", f"{TOKEN} and {webhook_secret()} and {TOKEN_SECRET_PART}")]
    report = render_report(steps, mode="setup", redact=[TOKEN_SECRET_PART, TOKEN, webhook_secret(), ""])
    assert report == (
        "DaFit bot setup, mode setup\n"
        "  bot                          failed     [redacted] and [redacted] and [redacted]\n"
        "Result: FAILED\n"
    )
