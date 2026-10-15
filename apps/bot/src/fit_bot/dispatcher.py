from aiogram import Dispatcher

from fit_bot.handlers import build_router


def build_dispatcher() -> Dispatcher:
    """No settings here: every transport passes settings= as workflow data, so this runs at import without env."""
    dp = Dispatcher(disable_fsm=True)
    dp.include_router(build_router())
    return dp
