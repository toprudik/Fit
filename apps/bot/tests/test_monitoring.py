"""Sentry in the bot (ADR 0017): off without SENTRY_DSN, and an event leaves without personal data."""

import logging

import pytest

from fit_bot import monitoring


@pytest.fixture(autouse=True)
def _fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(monitoring, "_started", False)


def test_reporting_is_off_without_a_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    calls: list[dict] = []
    monkeypatch.setattr(monitoring.sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))
    assert monitoring.init_monitoring() is False
    assert calls == []


def test_reporting_starts_once_with_private_options(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "https://key@o1.ingest.us.sentry.io/2")
    monkeypatch.setenv("VERCEL_ENV", "production")
    calls: list[dict] = []
    monkeypatch.setattr(monitoring.sentry_sdk, "init", lambda **kwargs: calls.append(kwargs))
    assert monitoring.init_monitoring() is True
    assert monitoring.init_monitoring() is True
    assert len(calls) == 1
    options = calls[0]
    assert options["environment"] == "production"
    assert options["send_default_pii"] is False
    assert options["include_local_variables"] is False
    assert options["max_breadcrumbs"] == 0
    assert options["traces_sample_rate"] == 0
    assert options["auto_enabling_integrations"] is False
    assert options["before_send"] is monitoring.scrub_event


def test_an_event_keeps_the_error_and_drops_personal_data() -> None:
    event = {
        "logger": "fit_bot.webhook",
        "logentry": {"message": "webhook: handler failed on update %d (%s): %s", "params": [1, "message", "KeyError"]},
        "user": {"id": "42", "username": "anna"},
        "request": {"data": "{}"},
        "extra": {"sys.argv": ["x"]},
        "breadcrumbs": {"values": [{"message": "hi"}]},
        "tags": {"chat": "42"},
        "contexts": {"runtime": {"name": "CPython"}, "state": {"update": {"text": "my weight"}}},
        "exception": {
            "values": [
                {
                    "type": "TelegramBadRequest",
                    "value": "chat 42 not found",
                    "stacktrace": {
                        "frames": [{"filename": "handlers/start.py", "lineno": 3, "vars": {"name": "Anna"}}]
                    },
                }
            ]
        },
    }
    scrubbed = monitoring.scrub_event(event)
    assert scrubbed is not None
    for key in ("user", "request", "extra", "breadcrumbs", "tags"):
        assert key not in scrubbed
    assert scrubbed["contexts"] == {"runtime": {"name": "CPython"}}
    exception = scrubbed["exception"]["values"][0]
    assert exception["type"] == "TelegramBadRequest"
    assert "value" not in exception
    assert exception["stacktrace"]["frames"] == [{"filename": "handlers/start.py", "lineno": 3}]
    assert scrubbed["logentry"]["params"] == [1, "message", "KeyError"]


@pytest.mark.parametrize("logger", ["aiogram.event", "aiohttp.access"])
def test_other_loggers_do_not_report(logger: str) -> None:
    assert monitoring.scrub_event({"logger": logger, "logentry": {"message": "Update from Anna"}}) is None


def test_the_logging_integration_reports_errors_only() -> None:
    integration = monitoring.sentry_options("https://key@o1.ingest.us.sentry.io/2")["integrations"][0]
    assert integration._handler is not None
    assert integration._handler.level == logging.ERROR
    assert integration._breadcrumb_handler is None
