# 15. Locale and interface preferences without a URL prefix

- Status: accepted
- Date: 2026-10-14

## Context

Routes in `docs/architecture/screens.md`, bot buttons and QR codes use plain paths (`/trainer/sessions/<id>`), so the language can't live in the URL. With Cache Components, reading a cookie in the root layout makes every page dynamic, and the language decides every string on the page, including `<html lang>`.

## Decision

- Pages live under `app/[lang]/`. `src/proxy.ts` rewrites each page URL `/x` to `/<locale>/x`, so `lang` is a root param that any Server Component reads through `next/root-params`, and every page is prerendered once per locale. Users never see the prefix.
- The locale comes from the `dafit-locale` cookie. Until the cookie is set, the person's primary language decides: Telegram's `language_code`, then the first `Accept-Language` entry. If that language is neither Russian nor English, the app uses Russian (ADR 0013, PRD wave 1 AUTH-1). The first sign-in writes the result to the cookie. Changing the language rewrites the cookie and reloads the page.
- The static HTML always ships with the dark theme. An inline script in `<head>` applies the theme preference (`dafit-theme`: system, light or dark) before the first paint, so the page never flashes the wrong theme. In "system" mode the script follows Telegram's color scheme inside the Mini App and `prefers-color-scheme` on the website.
- The proxy writes the last zone to `dafit-zone` on every visit to `/trainer/*` or `/client/*`, skipping prefetches, and `/` redirects there.
- Who is signed in streams into a single `<Suspense>` hole in the root layout; the rest of each page stays static.

## Consequences

- These cookies belong to the device and hold no personal data. Wave 1 adds `user_settings` (locale, theme, last_zone), and from then on the server also saves each choice to the account, so it follows the user to other devices (PRD wave 1 AUTH-2, AUTH-3). The cookies stay as the fast path for the proxy and the pre-paint script.
- Client code must not render from `usePathname()` during hydration, because the server sees `/ru/…`. Active navigation state comes from layout segments.
- Unknown paths fall into `app/[lang]/[...rest]` and render the localized not-found page.
