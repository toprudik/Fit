import pytest

from fakes import TOKEN
from fit_bot.config import Settings

BOT_VARIABLES = (
    "TELEGRAM_BOT_TOKEN",
    "WEBAPP_URL",
    "BOT_MODE",
    "BOT_WEBHOOK_URL",
    "TELEGRAM_WEBHOOK_SECRET",
    "PORT",
    "VERCEL_GIT_COMMIT_SHA",
    "VERCEL_ENV",
    "GITHUB_ACTIONS",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in BOT_VARIABLES:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def settings() -> Settings:
    return Settings(telegram_bot_token=TOKEN, webapp_url="https://app.example", bot_webhook_url="https://bot.example")  # type: ignore[arg-type]
