"""What the bot and apps/web must agree on, read from the web's own sources so a change on one side fails here.

The bot passes button taps to the web (handlers/actions.py) and opens the Mini App with ?source=<tag>; the web builds
the callback data (lib/bot-actions/callback-data.ts), checks the secret (secret.ts), parses the request (the route)
and answers (answer.ts). A drift on either side would make every action button answer "That didn't work".
"""

import dataclasses
import re
import uuid
from pathlib import Path

import pytest

from fakes import TOKEN
from fit_bot.config import ACTIONS_PATH, ACTIONS_SECRET_LABEL, Settings
from fit_bot.handlers.actions import ACTION_DATA, NOTICE_LIMIT, ActionAnswer
from fit_bot.keyboards import SOURCES, app_url
from fit_bot.texts import pick_locale

WEB = Path(__file__).resolve().parents[2] / "web" / "src"
BOT_ACTIONS = WEB / "lib" / "bot-actions"
#: The value apps/web/src/lib/bot-actions/secret.test.ts pins for the same token.
ACTIONS_SECRET_VECTOR = "9c029edef8f0c99afcfe14cb5b30ce0ed8e3527d33f1c495bfb1c063c1075a5f"


def web_source(path: Path) -> str:
    if not path.exists():  # pragma: no cover - only outside the monorepo
        pytest.skip(f"{path} is not in this checkout")
    return path.read_text(encoding="utf-8")


def web_prefixes() -> set[str]:
    """Every action the web parses: `action === "bky"` in parseBotAction."""
    return set(re.findall(r'action === "([a-z]+)"', web_source(BOT_ACTIONS / "callback-data.ts")))


def test_the_bot_forwards_exactly_the_actions_the_web_parses() -> None:
    prefixes = web_prefixes()
    assert prefixes == {"bky", "bkn", "mcy", "mcn", "ctn"}
    some_id = str(uuid.UUID(int=1))
    for prefix in prefixes:
        data = f"{prefix}:{some_id}"
        assert ACTION_DATA.match(data), prefix
        assert len(data.encode()) <= 64  # Telegram's callback_data limit
    for other in ("bkx", "ct", "xbky", "BKY", "mc", "cty"):
        assert not ACTION_DATA.match(f"{other}:{some_id}"), other


def test_the_web_builds_callback_data_with_the_same_prefixes() -> None:
    source = web_source(BOT_ACTIONS / "callback-data.ts")
    built = set(re.findall(r'"([a-z]{3})"', source)) | set(re.findall(r"`([a-z]{3}):", source))
    assert web_prefixes() <= built


def test_the_secret_matches_the_webs() -> None:
    source = web_source(BOT_ACTIONS / "secret.ts")
    label = re.search(r'const LABEL = "([^"]+)"', source)
    assert label is not None
    assert label.group(1).encode() == ACTIONS_SECRET_LABEL
    settings = Settings(telegram_bot_token=TOKEN, webapp_url="https://app.example")  # type: ignore[arg-type]
    assert settings.actions_secret() == ACTIONS_SECRET_VECTOR
    assert ACTIONS_SECRET_VECTOR in web_source(BOT_ACTIONS / "secret.test.ts")


def test_the_actions_route_exists_where_the_bot_posts() -> None:
    route = web_source(WEB / "app" / ACTIONS_PATH.lstrip("/") / "route.ts")
    assert "export async function POST" in route
    settings = Settings(telegram_bot_token=TOKEN, webapp_url="https://app.example/")  # type: ignore[arg-type]
    assert settings.actions_url() == f"https://app.example{ACTIONS_PATH}"


def test_the_bot_sends_the_fields_the_route_reads() -> None:
    route = web_source(WEB / "app" / ACTIONS_PATH.lstrip("/") / "route.ts")
    schema = re.search(r"z\.object\(\{(.*?)\}\)", route, re.S)
    assert schema is not None
    fields = set(re.findall(r"^\s*([a-z_]+):", schema.group(1), re.M))
    # on_action in handlers/actions.py posts these keys.
    assert fields == {"telegram_id", "data", "language_code"}
    limit = re.search(r"data: z\.string\(\)\.min\(1\)\.max\((\d+)\)", route)
    assert limit is not None and int(limit.group(1)) == 64


def test_the_bot_reads_the_answer_the_web_gives() -> None:
    answer = web_source(BOT_ACTIONS / "answer.ts")
    shape = re.search(r"export type BotActionAnswer = \{([^}]*)\}", answer)
    assert shape is not None
    web_fields = {name for name, _ in re.findall(r"([a-z]+)(\??):", shape.group(1))}
    assert web_fields == {field.name for field in dataclasses.fields(ActionAnswer)}
    assert NOTICE_LIMIT == 200  # Telegram's popup limit


def test_web_app_buttons_have_no_locale_and_a_tag_the_web_knows() -> None:
    # ADR 0015: the proxy adds the locale; a link that carries one breaks the language switch.
    for source in SOURCES:
        url = app_url("https://app.example", source)
        assert not re.search(r"//[^/]+/(ru|en)(/|$)", url)
        assert url.startswith("https://app.example/?source=bot_")


@pytest.mark.parametrize(
    ("code", "web"),
    [("en", "en"), ("en-US", "en"), ("EN_gb", "en"), ("ru", "ru"), ("uk", "ru"), ("", "ru"), (None, "ru")],
)
def test_bot_language_follows_the_web_rule(code: str | None, web: str) -> None:
    # telegramLocale in lib/bot-actions/answer.ts: a code that starts with "en" is English, everything else Russian.
    assert pick_locale(code) == web
    assert 'startsWith("en")' in web_source(BOT_ACTIONS / "answer.ts")
