import re
from dataclasses import fields

import pytest

from fit_bot.texts import BOT_NAME, CATALOG, COMMAND_NAMES, DEFAULT_LOCALE, LOCALES, Texts, pick_locale, texts_for

FORBIDDEN = re.compile("[—–!·→…“”‘’\U0001f000-\U0001faff☀-➿️]")

#: Telegram limits per key (characters).
LIMITS = {
    "start": 4096,
    "help": 4096,
    "fallback": 4096,
    "open_app_button": 32,
    "menu_button": 32,
    "command_start": 256,
    "command_help": 256,
    "description": 512,
    "short_description": 120,
}
#: Keys that are names and may read the same in both languages.
SAME_IN_BOTH: set[str] = {"menu_button"}


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        ("en", "en"),
        ("en-GB", "en"),
        ("EN_us", "en"),
        (" en ", "en"),
        ("ru", "ru"),
        ("uk", "ru"),
        ("de", "ru"),
        ("", "ru"),
        (None, "ru"),
        ("eng", "ru"),
    ],
)
def test_pick_locale(code: str | None, expected: str) -> None:
    assert pick_locale(code) == expected
    assert texts_for(code) is CATALOG[expected]  # type: ignore[index]


def test_catalogs_complete() -> None:
    assert set(CATALOG) == set(LOCALES)
    assert DEFAULT_LOCALE == "ru"
    names = [f.name for f in fields(Texts)]
    assert set(names) == set(LIMITS)
    for locale in LOCALES:
        for name in names:
            value = getattr(CATALOG[locale], name)
            assert isinstance(value, str) and value.strip(), (locale, name)
            assert value == value.strip(), (locale, name)


def test_no_forbidden_characters() -> None:
    for locale in LOCALES:
        for f in fields(Texts):
            value = getattr(CATALOG[locale], f.name)
            assert not FORBIDDEN.findall(value), (locale, f.name, FORBIDDEN.findall(value))
    assert not FORBIDDEN.findall(BOT_NAME)


def test_languages_differ() -> None:
    for f in fields(Texts):
        if f.name not in SAME_IN_BOTH:
            assert getattr(CATALOG["ru"], f.name) != getattr(CATALOG["en"], f.name), f.name


def test_limits() -> None:
    for locale in LOCALES:
        for name, limit in LIMITS.items():
            assert 1 <= len(getattr(CATALOG[locale], name)) <= limit, (locale, name)
    assert len(BOT_NAME) <= 64


def test_command_names() -> None:
    assert COMMAND_NAMES == ("start", "help")
    for name in COMMAND_NAMES:
        assert re.fullmatch(r"[a-z0-9_]{1,32}", name)


def test_ru_quotes_and_brand() -> None:
    ru, en = CATALOG["ru"], CATALOG["en"]
    assert f"«{ru.menu_button}»" in ru.help
    assert en.menu_button in en.help
    assert "'" not in "".join(getattr(ru, f.name) for f in fields(Texts))  # RU uses «ёлочки», not straight quotes
    for locale in LOCALES:
        texts = CATALOG[locale]
        assert "Fit " not in texts.start.replace("DaFit", "")
        assert "DaFit" in texts.start and "DaFit" in texts.description


def test_copy_matches_the_contract() -> None:
    """Section 6 of the contract: lengths as counted there."""
    ru, en = CATALOG["ru"], CATALOG["en"]
    assert (len(ru.start), len(en.start)) == (248, 279)
    assert (len(ru.help), len(en.help)) == (169, 198)
    assert (len(ru.fallback), len(en.fallback)) == (107, 112)
    assert (len(ru.description), len(en.description)) == (211, 218)
    assert (len(ru.short_description), len(en.short_description)) == (74, 71)
    assert ru.start.count("\n\n") == 1 and en.start.count("\n\n") == 1
