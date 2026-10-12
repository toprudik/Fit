"""Bot settings from environment variables. See docs/adr/0002-secrets-handling.md."""

import re
from typing import Literal, Self

from pydantic import HttpUrl, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SettingsError(RuntimeError):
    """Raised with variable names only — never values."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    telegram_bot_token: SecretStr
    #: Public HTTPS URL of the Mini App (the Next.js app).
    webapp_url: HttpUrl
    #: polling — local development; webhook — production (needs a public HTTPS URL).
    bot_mode: Literal["polling", "webhook"] = "polling"
    #: Public base URL where Telegram can reach this bot, e.g. https://bot.example.com
    bot_webhook_url: HttpUrl | None = None
    #: Random 16-256 chars [A-Za-z0-9_-]; Telegram echoes it in X-Telegram-Bot-Api-Secret-Token.
    telegram_webhook_secret: SecretStr | None = None
    port: int = 8080

    @field_validator("telegram_bot_token")
    @classmethod
    def _token_format(cls, v: SecretStr) -> SecretStr:
        if not re.fullmatch(r"\d+:[\w-]+", v.get_secret_value()):
            raise ValueError("must look like <id>:<secret>")
        return v

    @field_validator("telegram_webhook_secret")
    @classmethod
    def _webhook_secret_format(cls, v: SecretStr | None) -> SecretStr | None:
        if v is not None and not re.fullmatch(r"[A-Za-z0-9_-]{16,256}", v.get_secret_value()):
            raise ValueError("must be 16-256 chars of A-Z a-z 0-9 _ -")
        return v

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.webapp_url.scheme != "https":
            raise ValueError("WEBAPP_URL must be https (Telegram requires it for Mini Apps)")
        if self.bot_mode == "webhook" and (self.bot_webhook_url is None or self.telegram_webhook_secret is None):
            raise ValueError("webhook mode requires BOT_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET")
        return self


WEBHOOK_PATH = "/telegram/webhook"


def load_settings() -> Settings:
    try:
        return Settings()  # type: ignore[call-arg]
    except ValidationError as error:
        fields = sorted({".".join(str(p) for p in e["loc"]).upper() or e["msg"] for e in error.errors()})
        raise SettingsError(f"Invalid bot environment: {', '.join(fields)}. See .env.example.") from None
