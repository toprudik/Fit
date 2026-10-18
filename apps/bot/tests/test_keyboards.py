import pytest
from aiogram.types import MenuButtonWebApp

from fit_bot.keyboards import SOURCES, app_url, menu_button, open_app_keyboard, start_param
from fit_bot.texts import CATALOG


@pytest.mark.parametrize("source", SOURCES)
def test_app_url(source: str) -> None:
    assert app_url("https://h", source) == f"https://h/?source={source}"  # type: ignore[arg-type]
    assert app_url("https://h/", source) == f"https://h/?source={source}"  # type: ignore[arg-type]
    assert app_url("https://h/sub", source) == f"https://h/sub?source={source}"  # type: ignore[arg-type]


def test_sources_are_a_closed_list() -> None:
    assert SOURCES == ("bot_start", "bot_help", "bot_reply", "bot_menu")
    with pytest.raises(ValueError, match="unknown source"):
        app_url("https://h", "elsewhere")  # type: ignore[arg-type]


@pytest.mark.parametrize("locale", ["ru", "en"])
def test_keyboard_and_menu_button(locale: str) -> None:
    texts = CATALOG[locale]  # type: ignore[index]
    markup = open_app_keyboard("https://app.example/", texts, "bot_help")
    assert len(markup.inline_keyboard) == 1 and len(markup.inline_keyboard[0]) == 1
    button = markup.inline_keyboard[0][0]
    assert button.text == texts.open_app_button
    assert button.url is None
    assert button.web_app is not None and button.web_app.url == "https://app.example/?source=bot_help"

    menu = menu_button("https://app.example", texts)
    assert isinstance(menu, MenuButtonWebApp)
    assert menu.text == texts.menu_button
    assert menu.web_app.url == "https://app.example/?source=bot_menu"


def test_app_url_with_start_param() -> None:
    assert (
        app_url("https://h", "bot_start", "tp_anna__s_tg")
        == "https://h/?source=bot_start&tgWebAppStartParam=tp_anna__s_tg"
    )
    with pytest.raises(ValueError):
        app_url("https://h", "bot_start", "a b")


@pytest.mark.parametrize(
    ("payload", "expected"),
    [(None, None), ("", None), ("ch_tg", "ch_tg"), ("A-z_09", "A-z_09"), ("a b", None), ("é", None), ("x" * 513, None)],
)
def test_start_param(payload: str | None, expected: str | None) -> None:
    assert start_param(payload) == expected
