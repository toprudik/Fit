"""Vercel entry point for the project dafit-bot (Root Directory apps/bot). See docs/adr/0006."""

from fit_bot.asgi import app

__all__ = ["app"]
