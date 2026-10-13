# 13. Russian and English from day one, Russian by default

- Status: accepted
- Date: 2026-10-13

Every user-facing string goes through i18n from the first screen (no hard-coded copy), with RU and EN catalogs. Locale is detected from Telegram `language_code`, then the browser/system language; **Russian is the default** when unknown, and users can override in settings. Dates, numbers, currency and units format by locale; storage is always metric and UTC. Bot messages use the recipient's locale. Adding a language must be a catalog-only change.
