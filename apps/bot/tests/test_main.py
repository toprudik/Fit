import logging
from typing import Any

import pytest

from fakes import TOKEN
from fit_bot import __main__ as cli
from fit_bot.config import Settings
from fit_bot.polling import PollingRefusedError


def base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("WEBAPP_URL", "https://app.example")


def test_setup_needs_the_webhook_url(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    base_env(monkeypatch)
    assert cli.main(["setup"]) == 2
    assert "Invalid bot environment: BOT_WEBHOOK_URL. See .env.example." in caplog.text


def test_setup_passes_the_options(monkeypatch: pytest.MonkeyPatch) -> None:
    base_env(monkeypatch)
    monkeypatch.setenv("BOT_WEBHOOK_URL", "https://bot.example")
    seen: dict[str, Any] = {}

    async def fake_run_setup(settings: Settings, **kwargs: Any) -> int:
        seen.update(kwargs, settings=settings)
        return 1

    monkeypatch.setattr(cli, "run_setup", fake_run_setup)
    assert cli.main(["setup", "--check-only", "--bot-username", "@Other_bot"]) == 1
    assert seen["check_only"] is True
    assert seen["expected_username"] == "other_bot"
    assert cli.main(["setup"]) == 1
    assert seen["check_only"] is False
    assert seen["expected_username"] == "fitconnection_bot"


@pytest.mark.parametrize("argv", [[], ["run"]])
def test_run_is_the_default(monkeypatch: pytest.MonkeyPatch, argv: list[str]) -> None:
    base_env(monkeypatch)
    started: list[Settings] = []

    async def fake_run_polling(settings: Settings) -> None:
        started.append(settings)

    monkeypatch.setattr(cli, "run_polling", fake_run_polling)
    assert cli.main(argv) == 0
    assert len(started) == 1


def test_refused_polling_exits_2(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    base_env(monkeypatch)

    async def refuse(settings: Settings) -> None:
        raise PollingRefusedError("This is the production bot @fitconnection_bot.")

    monkeypatch.setattr(cli, "run_polling", refuse)
    with caplog.at_level(logging.ERROR):
        assert cli.main([]) == 2
    assert "production bot" in caplog.text


def test_run_with_invalid_settings_exits_2(caplog: pytest.LogCaptureFixture) -> None:
    assert cli.main([]) == 2
    assert "TELEGRAM_BOT_TOKEN" in caplog.text


def test_webhook_mode_needs_the_url(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    base_env(monkeypatch)
    monkeypatch.setenv("BOT_MODE", "webhook")
    assert cli.main([]) == 2
    assert "BOT_WEBHOOK_URL" in caplog.text
