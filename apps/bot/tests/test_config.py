import hashlib
import hmac
import re

import pytest

from fakes import BOT_ID, TOKEN, TOKEN_SECRET_PART
from fit_bot.config import (
    WEBHOOK_SECRET_LABEL,
    SettingsError,
    deployment_commit,
    derive_webhook_secret,
    load_settings,
    token_bot_id,
    vercel_env,
)

OVERRIDE = "override_secret_for-tests-0123"


def _base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")


def test_polling_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    settings = load_settings()
    assert settings.bot_mode == "polling"
    assert settings.telegram_bot_token.get_secret_value() == TOKEN
    assert settings.port == 8080


def test_errors_never_contain_secret_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "not-a-token-SECRETVALUE")
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")
    with pytest.raises(SettingsError) as info:
        load_settings()
    assert "TELEGRAM_BOT_TOKEN" in str(info.value)
    assert "SECRETVALUE" not in str(info.value)


@pytest.mark.parametrize(
    "url", ["http://fit.example", "https://fit.example/?a=1", "https://fit.example/#top", "https://fit.example/?"]
)
def test_webapp_must_be_https_without_query_or_fragment(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("WEBAPP_URL", url)
    with pytest.raises(SettingsError) as info:
        load_settings()
    assert str(info.value) == "Invalid bot environment: WEBAPP_URL. See .env.example."
    assert "fit.example" not in str(info.value)


def test_webhook_mode_requires_only_the_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("BOT_MODE", "webhook")
    assert load_settings().bot_mode == "webhook"  # a stray BOT_MODE never breaks the settings by itself
    with pytest.raises(SettingsError) as info:
        load_settings(require={"bot_webhook_url"})
    assert str(info.value) == "Invalid bot environment: BOT_WEBHOOK_URL. See .env.example."
    monkeypatch.setenv("BOT_WEBHOOK_URL", "https://bot.fit.example")
    settings = load_settings(require={"bot_webhook_url"})
    assert settings.webhook_url() == "https://bot.fit.example/telegram/webhook"
    assert settings.telegram_webhook_secret is None


def test_require_is_named_together_with_invalid_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    with pytest.raises(SettingsError) as info:
        load_settings(require={"bot_webhook_url"})
    assert str(info.value) == "Invalid bot environment: BOT_WEBHOOK_URL, WEBAPP_URL. See .env.example."


def test_empty_variables_count_as_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    """.env.example copied to .env.local has BOT_WEBHOOK_URL= and TELEGRAM_WEBHOOK_SECRET=; polling must still start."""
    _base_env(monkeypatch)
    monkeypatch.setenv("BOT_MODE", "polling")
    monkeypatch.setenv("BOT_WEBHOOK_URL", "")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "")
    monkeypatch.setenv("PORT", "")
    settings = load_settings()
    assert settings.bot_webhook_url is None
    assert settings.telegram_webhook_secret is None
    assert settings.port == 8080


def test_empty_required_variable_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "")
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")
    with pytest.raises(SettingsError, match=r"^Invalid bot environment: TELEGRAM_BOT_TOKEN\. See \.env\.example\.$"):
        load_settings()


@pytest.mark.parametrize(
    "url",
    ["https://bot.example/hook", "http://bot.example", "https://bot.example/?a=1", "https://bot.example/#x"],
)
def test_webhook_url_must_be_an_https_origin(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("BOT_WEBHOOK_URL", url)
    with pytest.raises(SettingsError) as info:
        load_settings()
    assert str(info.value) == "Invalid bot environment: BOT_WEBHOOK_URL. See .env.example."


@pytest.mark.parametrize("secret", ["short", "has space in it 0123", "x" * 257, "ünïcode-secret-0123"])
def test_webhook_secret_override_format(monkeypatch: pytest.MonkeyPatch, secret: str) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", secret)
    with pytest.raises(SettingsError) as info:
        load_settings()
    assert "TELEGRAM_WEBHOOK_SECRET" in str(info.value)
    assert secret not in str(info.value)


@pytest.mark.parametrize("port", ["0", "65536", "http"])
def test_port_range(monkeypatch: pytest.MonkeyPatch, port: str) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("PORT", port)
    with pytest.raises(SettingsError, match="PORT"):
        load_settings()


def test_derived_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = derive_webhook_secret(TOKEN)
    assert re.fullmatch(r"[0-9a-f]{64}", secret)
    assert secret == derive_webhook_secret(TOKEN)
    assert secret != derive_webhook_secret("654321:another-test-token")
    assert secret == hmac.new(TOKEN.encode(), b"dafit/telegram-webhook-secret/v1", hashlib.sha256).hexdigest()
    assert WEBHOOK_SECRET_LABEL == b"dafit/telegram-webhook-secret/v1"
    assert TOKEN_SECRET_PART not in secret

    _base_env(monkeypatch)
    assert load_settings().webhook_secret() == secret
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", OVERRIDE)
    assert load_settings().webhook_secret() == OVERRIDE


def test_bot_id(monkeypatch: pytest.MonkeyPatch) -> None:
    assert token_bot_id() is None
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "garbage")
    assert token_bot_id() is None
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN)
    assert token_bot_id() == BOT_ID  # works without WEBAPP_URL
    monkeypatch.setenv("WEBAPP_URL", "https://fit.example")
    assert load_settings().bot_id == BOT_ID


def test_vercel_values(monkeypatch: pytest.MonkeyPatch) -> None:
    assert deployment_commit() is None
    assert vercel_env() is None
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "  ")
    monkeypatch.setenv("VERCEL_ENV", "")
    assert deployment_commit() is None
    assert vercel_env() is None
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", " abc123 ")
    monkeypatch.setenv("VERCEL_ENV", "preview")
    assert deployment_commit() == "abc123"
    assert vercel_env() == "preview"


def test_no_error_message_contains_a_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", TOKEN + " ")
    monkeypatch.setenv("WEBAPP_URL", "http://webapp.example")
    monkeypatch.setenv("BOT_WEBHOOK_URL", "https://hook.example/path")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "bad secret value!")
    with pytest.raises(SettingsError) as info:
        load_settings()
    message = str(info.value)
    assert message == (
        "Invalid bot environment: BOT_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBAPP_URL. "
        "See .env.example."
    )
    for value in (TOKEN_SECRET_PART, "webapp.example", "hook.example", "bad secret"):
        assert value not in message
    assert info.value.__cause__ is None
    assert info.value.__suppress_context__
