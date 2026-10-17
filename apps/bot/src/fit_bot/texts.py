"""Every bot string, RU and EN. Copy follows docs/writing.md; operator-facing logs and settings errors stay in English
outside this catalog."""

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Final, Literal

Locale = Literal["ru", "en"]
LOCALES: Final[tuple[Locale, ...]] = ("ru", "en")
DEFAULT_LOCALE: Final[Locale] = "ru"
BOT_NAME: Final = "DaFit"
COMMAND_NAMES: Final = ("start", "help")


@dataclass(frozen=True, slots=True)
class Texts:
    start: str
    help: str
    fallback: str
    open_app_button: str
    menu_button: str
    command_start: str
    command_help: str
    description: str
    short_description: str
    #: Popup on an action button when the app could not be asked (PRD §3 Т2).
    action_failed: str


_RU: Final = Texts(
    start=(
        "Привет, это DaFit. Здесь тренер ведёт расписание, абонементы и прогресс клиентов, "
        "а клиент записывается на занятия.\n\n"
        "Открой DaFit кнопкой ниже. Пароль не нужен: ты войдёшь через свой аккаунт Telegram. "
        "Сюда же будут приходить напоминания о занятиях."
    ),
    help=(
        "Открой DaFit кнопкой ниже или кнопкой «DaFit» слева от поля ввода. "
        "Сюда бот присылает напоминания о занятиях и другие уведомления. "
        "Сообщения в этом чате никто не читает."
    ),
    fallback=(
        "Сообщения в этом чате никто не читает. Открой DaFit кнопкой ниже: там твои занятия, абонементы и настройки."
    ),
    open_app_button="Открыть DaFit",
    menu_button="DaFit",
    command_start="Открыть DaFit",
    command_help="Что умеет бот",
    description=(
        "DaFit помогает персональному тренеру вести расписание, абонементы и прогресс клиентов. "
        "Клиенты записываются на занятия и видят остаток абонемента. "
        "Бот открывает приложение и присылает напоминания перед занятием."
    ),
    short_description="Расписание, абонементы и прогресс для персональных тренеров и их клиентов.",
    action_failed="Не получилось. Ответь на запрос в приложении.",
)

_EN: Final = Texts(
    start=(
        "Hi, this is DaFit. Trainers manage their schedule and keep track of client passes and progress here, "
        "and clients book sessions.\n\n"
        "Open DaFit with the button below. You don't need a password: you'll log in with your Telegram account. "
        "You'll also get session reminders in this chat."
    ),
    help=(
        "Open DaFit with the button below or with the DaFit button to the left of the message field. "
        "The bot sends session reminders and other notifications to this chat. "
        "Nobody reads messages you send here."
    ),
    fallback=(
        "Nobody reads messages in this chat. Open DaFit with the button below to see your sessions, passes, "
        "and settings."
    ),
    open_app_button="Open DaFit",
    menu_button="DaFit",
    command_start="Open DaFit",
    command_help="What this bot does",
    description=(
        "DaFit helps personal trainers manage their schedule and keep track of client passes and progress. "
        "Clients book sessions and see what's left on their pass. "
        "The bot opens the app and sends a reminder before each session."
    ),
    short_description="Schedule, passes, and progress for personal trainers and their clients.",
    action_failed="That didn't work. Answer the request in the app.",
)

CATALOG: Final[Mapping[Locale, Texts]] = MappingProxyType({"ru": _RU, "en": _EN})


def pick_locale(language_code: str | None) -> Locale:
    """The web rule (matchLocale in apps/web/src/i18n/config.ts): base tag "en" gives EN, anything else RU."""
    base = (language_code or "").strip().lower().replace("_", "-").split("-", 1)[0]
    return "en" if base == "en" else DEFAULT_LOCALE


def texts_for(language_code: str | None) -> Texts:
    return CATALOG[pick_locale(language_code)]
