from aiogram import Router

from . import commands, fallback


def build_router() -> Router:
    """The root router: commands first, the text fallback last. Builds new routers on every call."""
    router = Router(name="root")
    router.include_router(commands.build_router())
    router.include_router(fallback.build_router())
    return router
