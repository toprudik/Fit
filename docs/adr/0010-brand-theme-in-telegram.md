# 10. DaFit's own brand theme everywhere, including inside Telegram

- Status: accepted — supersedes the "follow the user's Telegram theme" line of ADR 0003
- Date: 2026-10-13

The product is premium and brand-led (references: Apple Fitness, Whoop), so the Mini App uses **DaFit's own design tokens**, not the user's Telegram colors. From Telegram we take only the light/dark color scheme (and safe-area insets); `--tg-theme-*` variables are a fallback, not the source of truth. Outside Telegram the theme follows the system with a manual override in settings. Header and bottom bar colors are set through the Mini App API to match the brand so the app feels native, not like a web page.

Update 2026-10-14: with the design system in the app (`docs/design.md`), the web app no longer reads `--tg-theme-*` at all, not even as a fallback. Telegram gives only the light/dark scheme and the safe-area insets; Telegram's header, background and bottom bar are painted with DaFit's `bg` token. How the preference is stored and applied: ADR 0015.
