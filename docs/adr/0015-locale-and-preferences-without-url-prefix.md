# 15. Locale and interface preferences without a URL prefix

- Status: accepted
- Date: 2026-10-14

## Context

Routes in `docs/architecture/screens.md`, bot buttons and QR codes use plain paths (`/trainer/sessions/<id>`), so the language can't live in the URL. With Cache Components, reading a cookie in the root layout makes every page dynamic, and the language decides every string on the page, including `<html lang>`.

## Decision

- Pages live under `app/[lang]/`. `src/proxy.ts` rewrites each page URL `/x` to `/<locale>/x`, so `lang` is a root param, `next/root-params` gives it to any Server Component, and every page is prerendered once per locale. Users never see the prefix.
- The locale is the `dafit-locale` cookie if set. Without it the primary language decides: Telegram `language_code` (stored in the cookie at the first sign-in), then the first `Accept-Language` entry; anything we don't support gets Russian (ADR 0013, PRD wave 1 AUTH-1). Changing the language rewrites the cookie and reloads the page.
- The theme preference (`dafit-theme`: system, light, dark) is applied by an inline script in `<head>` before the first paint, so the static HTML ships the dark default and never flashes. In "system" mode the script uses Telegram's color scheme inside the Mini App and `prefers-color-scheme` on the website.
- The last zone (`dafit-zone`) is set by the proxy on every visit to `/trainer/*` or `/client/*` (not on prefetches); `/` redirects there.
- Who is signed in streams into a single `<Suspense>` hole in the root layout; the rest of each page stays static.

## Consequences

- These cookies are device-level and hold no personal data. Wave 1 adds `user_settings` (locale, theme, last_zone); then the server also saves the choice per account so it follows the user across devices (PRD wave 1 AUTH-2, AUTH-3), and the cookies stay as the fast path for the proxy and the pre-paint script.
- Client code must not render from `usePathname()` during hydration (the server sees `/ru/…`); active navigation state comes from layout segments.
- Unknown paths fall into `app/[lang]/[...rest]` and render the localized not-found page.
