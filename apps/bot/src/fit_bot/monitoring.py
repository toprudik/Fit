"""Error reporting to Sentry, off unless SENTRY_DSN is set (ADR 0017, the bot's half).

The bot's error policy (webhook.process_update) already writes every failure as a log line that names the update id,
its kind and the error type, never the user, the chat or a message text. Sentry turns those ERROR lines into events
and adds nothing of its own: no user, request, breadcrumbs, local variables or extra data, and an exception keeps
its type and stack but not its message, which can hold a chat id or the token URL.
"""

import logging
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

from fit_bot.config import deployment_commit, sentry_dsn, vercel_env

Event = dict[str, Any]

#: Only the bot's own loggers report: their messages are written to carry no personal data.
OWN_LOGGER = "fit_bot"
#: Contexts that describe the runtime, not the person or the request.
KEPT_CONTEXTS = frozenset({"runtime", "os"})

_started = False


def init_monitoring() -> bool:
    """Starts Sentry once per process when SENTRY_DSN is set. Returns whether reporting is on."""
    global _started
    if _started:
        return True
    dsn = sentry_dsn()
    if dsn is None:
        return False
    sentry_sdk.init(**sentry_options(dsn))
    _started = True
    return True


def sentry_options(dsn: str) -> dict[str, Any]:
    return {
        "dsn": dsn,
        "environment": vercel_env() or "development",
        "release": deployment_commit(),
        "server_name": "dafit-bot",
        "send_default_pii": False,
        "include_local_variables": False,
        "include_source_context": False,
        "max_breadcrumbs": 0,
        "traces_sample_rate": 0,
        "auto_enabling_integrations": False,
        "integrations": [LoggingIntegration(level=None, event_level=logging.ERROR)],
        "before_send": scrub_event,
    }


def scrub_event(event: Event, hint: dict[str, Any] | None = None) -> Event | None:
    """Keeps the error, its stack and the log line of the bot's own loggers; drops everything else."""
    del hint
    logger = event.get("logger") or ""
    if logger and logger != OWN_LOGGER and not logger.startswith(OWN_LOGGER + "."):
        return None
    for key in ("user", "request", "extra", "breadcrumbs", "tags", "modules"):
        event.pop(key, None)
    contexts = event.get("contexts")
    if isinstance(contexts, dict):
        event["contexts"] = {name: value for name, value in contexts.items() if name in KEPT_CONTEXTS}
    for exception in (event.get("exception") or {}).get("values") or []:
        exception.pop("value", None)
        for frame in (exception.get("stacktrace") or {}).get("frames") or []:
            for key in ("vars", "pre_context", "context_line", "post_context"):
                frame.pop(key, None)
    return event
