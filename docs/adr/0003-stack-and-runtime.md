# 3. Stack, repo layout and runtime

- Status: accepted
- Date: 2026-10-12

## Decision

Monorepo with two apps, each with its own toolchain and Dockerfile:

| Path | What | Stack |
|---|---|---|
| `apps/web` | Website **and** Telegram Mini App (one Next.js app; the Mini App is the same site opened inside Telegram) | Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (new-york, neutral), motion (Framer Motion), `@tma.js/sdk-react`, `@supabase/ssr`, zod, Vitest |
| `apps/bot` | Telegram bot `@fitconnection_bot` | Python 3.13, aiogram 3, pydantic-settings, uv, ruff, pytest |
| `supabase/migrations` | Database schema | SQL migrations applied to the Supabase project |

- **Local development runs in Docker**: `docker compose up` starts web (hot reload) and the bot (polling). `--profile tunnel` adds a Cloudflare quick tunnel to get the HTTPS URL Telegram requires for Mini Apps.
- **Production**: web on Vercel (or the `runner` image via `docker-compose.prod.yml`). The bot runs serverless on Vercel in webhook mode during the beta, as ADR 0006 describes (it supersedes the earlier "bot in a Docker container" plan).
- **Database**: hosted Supabase project (no local Supabase stack yet). Schema changes are files in `supabase/migrations/`, applied to the dev project, then to production.
- **Bot ↔ web**: the bot only opens the Mini App and sends messages; business logic and data access live in the web app / database, not in the bot.
- **shadcn/ui**: components live in `apps/web/src/components/ui` and are added with `npx shadcn@latest add <name>` from `apps/web`.
- **Fonts**: self-hosted, no build-time Google Fonts fetch. Since 2026-10-14 the design system fonts Onest and Tektur Narrow are loaded from `apps/web/src/fonts` with `next/font/local` (`docs/design.md`); they replaced Geist.

## Consequences

- Two languages (TypeScript + Python) and two CI jobs; the bot stays thin to keep the split cheap.
- Inside Telegram the UI uses DaFit's own brand theme; only light/dark comes from Telegram (see ADR 0010).
- A quick tunnel URL changes on every run; for regular Mini App testing set up a named tunnel with a stable hostname.
