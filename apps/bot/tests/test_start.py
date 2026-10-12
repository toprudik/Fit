import asyncio
from types import SimpleNamespace

from fit_bot.config import Settings
from fit_bot.handlers.start import WELCOME, on_start
from fit_bot.keyboards import OPEN_APP_TEXT


class FakeMessage:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    async def answer(self, text: str, reply_markup: object = None) -> None:
        self.calls.append((text, reply_markup))


def test_start_sends_web_app_button() -> None:
    settings = SimpleNamespace(webapp_url="https://fit.example/")
    message = FakeMessage()
    asyncio.run(on_start(message, settings))  # type: ignore[arg-type]

    text, markup = message.calls[0]
    assert text == WELCOME
    button = markup.inline_keyboard[0][0]  # type: ignore[attr-defined]
    assert button.text == OPEN_APP_TEXT
    assert button.web_app.url == "https://fit.example/"


def test_settings_type_is_importable() -> None:
    assert Settings.model_fields["bot_mode"].default == "polling"
