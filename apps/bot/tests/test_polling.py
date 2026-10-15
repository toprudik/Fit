import asyncio
from typing import Any

import pytest
from aiogram import Dispatcher
from aiogram.methods import GetMe, GetWebhookInfo

from fakes import DEV_BOT_USERNAME, RecordingSession, recording_bot
from fit_bot import polling
from fit_bot.config import Settings
from fit_bot.polling import PollingRefusedError, ensure_safe_to_poll, run_polling

PRODUCTION = {"id": 1, "is_bot": True, "first_name": "DaFit", "username": "FitConnection_Bot"}
WITH_WEBHOOK = {
    "url": "https://bot.example/telegram/webhook",
    "has_custom_certificate": False,
    "pending_update_count": 0,
}


def writes(session: RecordingSession) -> list[str]:
    return [name for name in session.names() if name.startswith(("Set", "Delete", "GetUpdates", "Close", "LogOut"))]


@pytest.fixture
def started(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def fake_start_polling(self: Dispatcher, *bots: Any, **kwargs: Any) -> None:
        calls.append(kwargs)

    monkeypatch.setattr(Dispatcher, "start_polling", fake_start_polling)
    return calls


def use_session(monkeypatch: pytest.MonkeyPatch, session: RecordingSession) -> None:
    monkeypatch.setattr(polling, "make_bot", lambda settings: recording_bot(session))


def test_production_bot_is_refused(settings: Settings, monkeypatch: pytest.MonkeyPatch, started: list[Any]) -> None:
    session = RecordingSession(responses={GetMe: PRODUCTION})
    use_session(monkeypatch, session)
    with pytest.raises(PollingRefusedError) as info:
        asyncio.run(run_polling(settings))
    assert "@fitconnection_bot" in str(info.value)
    assert "docs/adr/0002-secrets-handling.md §5" in str(info.value)
    assert "deleteWebhook" not in str(info.value)  # never suggest removing the production webhook
    assert session.names() == ["GetMe"]
    assert started == []
    assert session.closed == 1


def test_bot_with_a_webhook_is_refused(settings: Settings, monkeypatch: pytest.MonkeyPatch, started: list[Any]) -> None:
    session = RecordingSession(responses={GetWebhookInfo: WITH_WEBHOOK})
    use_session(monkeypatch, session)
    with pytest.raises(PollingRefusedError, match="has a webhook") as info:
        asyncio.run(run_polling(settings))
    assert "docs/adr/0002-secrets-handling.md §5" in str(info.value)
    # The way out when it is your own dev bot: the code never deletes a webhook itself.
    assert str(info.value).endswith(
        "If this is your dev bot, remove its webhook first: open "
        "https://api.telegram.org/bot<dev bot token>/deleteWebhook in a browser."
    )
    assert session.names() == ["GetMe", "GetWebhookInfo"]
    assert writes(session) == []
    assert started == []


def test_dev_bot_passes() -> None:
    session = RecordingSession()
    asyncio.run(ensure_safe_to_poll(recording_bot(session)))
    assert session.names() == ["GetMe", "GetWebhookInfo"]


def test_dev_bot_syncs_profile_without_name_and_polls(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, started: list[dict[str, Any]]
) -> None:
    session = RecordingSession()
    use_session(monkeypatch, session)
    asyncio.run(run_polling(settings))
    names = session.names()
    assert names[:2] == ["GetMe", "GetWebhookInfo"]
    assert "SetMyCommands" in names and "SetChatMenuButton" in names
    assert "SetMyName" not in names and "GetMyName" not in names
    assert "DeleteWebhook" not in names
    assert started == [{"allowed_updates": ["message"], "settings": settings}]
    assert DEV_BOT_USERNAME
