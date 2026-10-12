import pytest

from fit_bot.config import SettingsError, load_settings

TOKEN = "123456:TEST-token_for-unit-tests"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("TELEGRAM_BOT_TOKEN", "WEBAPP_URL", "BOT_MODE", "BOT_WEBHOOK_URL", "TELEGRAM_WEBHOOK_SECRET"):
        monkeypatch.delenv(name, raising=False)


def test_polling_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")
    settings = load_settings()
    assert settings.bot_mode == "polling"
    assert settings.telegram_bot_token.get_secret_value() == TOKEN


def test_errors_never_contain_secret_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "not-a-token-SECRETVALUE")
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")
    with pytest.raises(SettingsError) as info:
        load_settings()
    assert "TELEGRAM_BOT_TOKEN" in str(info.value)
    assert "SECRETVALUE" not in str(info.value)


def test_webapp_must_be_https(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("WEBAPP_URL", "http://fit.example")
    with pytest.raises(SettingsError):
        load_settings()


def test_webhook_mode_requires_url_and_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")
    monkeypatch.setenv("BOT_MODE", "webhook")
    with pytest.raises(SettingsError):
        load_settings()
    monkeypatch.setenv("BOT_WEBHOOK_URL", "https://bot.fit.example")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "a" * 32)
    assert load_settings().bot_mode == "webhook"
