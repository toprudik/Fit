"""Bot settings from environment variables. See docs/adr/0002-secrets-handling.md.

Every environment read of the bot lives in this module. Errors name variables, never their values.
"""

import hashlib
import hmac
import os
import re
from collections.abc import Collection
from typing import Final, Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, HttpUrl, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

WEBHOOK_PATH: Final = "/telegram/webhook"
HEALTH_PATH: Final = "/healthz"
WEBHOOK_SECRET_LABEL: Final = b"dafit/telegram-webhook-secret/v1"
#: Never polled locally; setup expects it by default.
PRODUCTION_BOT_USERNAME: Final = "fitconnection_bot"

_TOKEN_RE: Final = re.compile(r"\d+:[\w-]+")
_TOKEN_BOT_ID_RE: Final = re.compile(r"(\d+):")
_WEBHOOK_SECRET_RE: Final = re.compile(r"[A-Za-z0-9_-]{16,256}")


class SettingsError(RuntimeError):
    """Raised with variable names only, never values."""


class Settings(BaseSettings):
    # env_ignore_empty: an empty variable (as copied from .env.example) counts as unset.
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False, env_ignore_empty=True)

    telegram_bot_token: SecretStr
    #: Public HTTPS URL of the Mini App (the Next.js app); Telegram requires https.
    webapp_url: HttpUrl
    #: Docker only: polling for local development, webhook for docker-compose.prod.yml. Vercel does not read it.
    bot_mode: Literal["polling", "webhook"] = "polling"
    #: Public HTTPS origin Telegram calls, e.g. https://bot.example.com (self-hosted webhook and setup).
    bot_webhook_url: HttpUrl | None = None
    #: Optional override of the derived webhook secret: 16-256 chars of A-Z a-z 0-9 _ -.
    telegram_webhook_secret: SecretStr | None = None
    port: int = Field(8080, ge=1, le=65535)

    @field_validator("telegram_bot_token")
    @classmethod
    def _token_format(cls, value: SecretStr) -> SecretStr:
        if not _TOKEN_RE.fullmatch(value.get_secret_value()):
            raise ValueError("must look like <id>:<secret>")
        return value

    @field_validator("webapp_url")
    @classmethod
    def _webapp_url_format(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https" or value.query is not None or value.fragment is not None:
            raise ValueError("must be an https URL without query or fragment")
        return value

    @field_validator("bot_webhook_url")
    @classmethod
    def _webhook_url_format(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is None:
            return None
        if (
            value.scheme != "https"
            or (value.path or "/") != "/"
            or value.query is not None
            or value.fragment is not None
        ):
            raise ValueError("must be an https origin without path, query or fragment")
        return value

    @field_validator("telegram_webhook_secret")
    @classmethod
    def _webhook_secret_format(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not _WEBHOOK_SECRET_RE.fullmatch(value.get_secret_value()):
            raise ValueError("must be 16-256 chars of A-Z a-z 0-9 _ -")
        return value

    @property
    def bot_id(self) -> int:
        """The bot's public user id: the numeric part of the token before the colon."""
        return int(self.telegram_bot_token.get_secret_value().split(":", 1)[0])

    def webhook_secret(self) -> str:
        """TELEGRAM_WEBHOOK_SECRET when set, else the secret derived from the token."""
        if self.telegram_webhook_secret is not None:
            return self.telegram_webhook_secret.get_secret_value()
        return derive_webhook_secret(self.telegram_bot_token.get_secret_value())

    def webhook_url(self) -> str:
        """The URL Telegram calls: the BOT_WEBHOOK_URL origin plus WEBHOOK_PATH."""
        if self.bot_webhook_url is None:
            raise SettingsError("Invalid bot environment: BOT_WEBHOOK_URL. See .env.example.")
        parts = urlsplit(str(self.bot_webhook_url))
        return urlunsplit((parts.scheme, parts.netloc, WEBHOOK_PATH, "", ""))


def derive_webhook_secret(token: str) -> str:
    """hex(HMAC-SHA256(key=token, msg=WEBHOOK_SECRET_LABEL)): 64 chars, rotates with the token (ADR 0002 §7)."""
    return hmac.new(token.encode(), WEBHOOK_SECRET_LABEL, hashlib.sha256).hexdigest()


def load_settings(*, require: Collection[str] = ()) -> Settings:
    """Reads the settings; `require` lists optional fields this mode needs (e.g. {"bot_webhook_url"})."""
    try:
        settings = Settings()  # type: ignore[call-arg]
    except ValidationError as error:
        names = {_variable_name(e["loc"]) for e in error.errors()}
        names.update(name.upper() for name in require if _env(name.upper()) is None)
        raise SettingsError(_message(names)) from None
    missing = {name.upper() for name in require if getattr(settings, name) is None}
    if missing:
        raise SettingsError(_message(missing))
    return settings


def token_bot_id() -> int | None:
    """Numeric part of TELEGRAM_BOT_TOKEN when it looks like <digits>:..., else None. Needs no other setting."""
    match = _TOKEN_BOT_ID_RE.match(_env("TELEGRAM_BOT_TOKEN") or "")
    return int(match.group(1)) if match else None


def deployment_commit() -> str | None:
    """VERCEL_GIT_COMMIT_SHA, set by Vercel when system environment variables are exposed."""
    return _env("VERCEL_GIT_COMMIT_SHA")


def vercel_env() -> str | None:
    """VERCEL_ENV: production, preview or development."""
    return _env("VERCEL_ENV")


def in_github_actions() -> bool:
    return os.environ.get("GITHUB_ACTIONS") == "true"


def _env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


def _variable_name(loc: tuple[int | str, ...]) -> str:
    return ".".join(str(part) for part in loc).upper() or "BOT SETTINGS"


def _message(names: Collection[str]) -> str:
    return f"Invalid bot environment: {', '.join(sorted(names))}. See .env.example."
