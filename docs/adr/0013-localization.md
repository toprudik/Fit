# 13. Russian and English from day one, Russian by default

- Status: accepted
- Date: 2026-10-13

Every user-facing string goes through i18n from the first screen (no hard-coded copy), with RU and EN catalogs. Locale is detected from Telegram `language_code`, then the browser/system language; **Russian is the default** when unknown, and users can override in settings. Dates, numbers, currency and units format by locale; storage is always metric and UTC. Bot messages use the recipient's locale. Adding a language must be a catalog-only change.

## Note (2026-10-15)

The bot answers `/start`, `/help` and any other text in the sender's Telegram `language_code` (base tag `en` gives English, anything else Russian), because it has no database access (ADR 0006) and does not know the language saved in DaFit. Reminders and other notifications, which the web sends from the outbox, use the language saved in DaFit, so wave-1 AUTH-2 holds for every bot message that is not a reply. Claude decided this on 2026-10-15 at the owner's request (`docs/decisions.md`, Q66).
