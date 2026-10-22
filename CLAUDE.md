# DaFit

Working name DaFit (repo `fit`). Web app + Telegram Mini App (`apps/web`, Next.js) and Telegram bot (`apps/bot`, aiogram). Stack and layout: `docs/adr/0003-stack-and-runtime.md`. Run locally with `docker compose up` (see README).

## Read before building a feature

- `docs/decisions.md`: product decisions (source of truth); `CONTEXT.md`: domain glossary, use its terms in code and copy.
- `docs/prd/`: what to build per wave, plus `quality.md` (Definition of Done); `docs/architecture/data-model.md` (schema, ledger, RLS) and `screens.md` (routes, app shell).
- `docs/adr/`: architectural decisions; don't contradict an ADR silently.
- `docs/plan.md`: delivery plan to the 24.11.2026 beta.
- `docs/design.md`: design system and mockups; follow its rules (voice, color roles, selection = inverse, Da-moment) when building UI.

## Working in this repo

- **apps/web**: Next.js 16 differs from older versions, so read `apps/web/AGENTS.md` and the bundled docs in `apps/web/node_modules/next/dist/docs/` before writing Next.js code. Cache Components are on: anything reading cookies/headers/searchParams sits behind `<Suspense>`; middleware is `src/proxy.ts`.
- **UI**: shadcn/ui components in `src/components/ui` (add with `npx shadcn@latest add <name>`), Tailwind v4 tokens in `src/app/globals.css`, animations with `motion/react`. DaFit's own brand theme everywhere, inside Telegram too (only light/dark comes from Telegram), see ADR 0010. Design system, mockups and token snapshot: `docs/design.md` (token names in `docs/design/tokens.json` are the contract for CSS variables).
- **Texts**: every UI string (RU and EN), bot message and doc reads as plain human writing; proofread it against `docs/writing.md` before finishing, using the `humanizer` skill when the session has it.
- **i18n and preferences**: UI strings live only in `src/i18n/dictionaries/{ru,en}.ts` (`getDictionary()` in Server Components, `useI18n()` in Client Components). Pages sit under `app/[lang]/`; the proxy rewrites URLs to the user's locale, so never put the locale in links and never render from `usePathname()` during hydration (ADR 0015). Theme and language preferences: `src/lib/theme`, `src/i18n/client.tsx`.
- **Auth**: Telegram only (Mini App initData or OIDC on the web) → Supabase session. Never trust `initDataUnsafe` or client-sent user ids. See `docs/adr/0004-telegram-auth.md`.
- **Supabase clients**: `lib/supabase/server.ts` (user, RLS) for reads/writes on behalf of a user; `lib/supabase/admin.ts` (secret key) only where RLS must be bypassed, never to serve user data. Both are typed with the generated `Database` (`lib/supabase/database.types.ts`). Some tables hide columns by grant (`profiles`, `sessions`, `recurrences`, `trainer_invites`, `calendar_feeds`): list the columns, since `select('*')` fails there with 42501.
- **apps/bot**: thin; it answers commands and opens the Mini App; no business logic. Outgoing notifications are sent from the notification outbox, not by bot code (ADR 0006). Bot strings live in `src/fit_bot/texts.py` (RU and EN). Deployed as a webhook with a secret token; on Vercel the webhook and bot profile are set only by `python -m fit_bot setup` (workflow `Bot setup`), never by a deployment (the self-hosted `docker-compose.prod.yml` registers its own on start). Local polling needs your own dev bot.
- **Checks before committing**: web `npm run lint && npm run typecheck && npm test && npm run build` (UI changes: also `npm run e2e`, Playwright + axe at 390 and 1280 px in both themes); bot `uv run ruff check . && uv run ruff format --check . && uv run pytest`; database (repo root, Docker, Supabase CLI 2.121.0) `supabase db start` (`supabase db reset` after editing migrations), then `supabase test db && supabase db lint --local --schema public,private --fail-on error && supabase db advisors --local --type all --fail-on warn`, and after DDL changes `supabase gen types typescript --local > apps/web/src/lib/supabase/database.types.ts` (commit it unformatted; CI diffs it).

## Code graph (Graphify)

Cloud sessions build a code graph of apps/web, apps/bot and supabase at start (`scripts/graphify-setup.sh`, in the background, about 30 s, no LLM, nothing leaves the container; log in `/tmp/graphify-setup.log`). It lives in `graphify-out/` (ignored) and rebuilds itself after every commit, checkout and merge. Use it to save tokens before grepping and reading files:

- `graphify affected "bookSlot()"`: who calls a function or imports a module, two levels deep. Use it before changing a shared function instead of a series of greps. Hubs such as `createSupabaseServerClient()` (`explain` shows a Degree above 50) return hundreds of lines: add `--depth 1` and `| head -40`, or count with `| wc -l` first.
- `graphify explain "createSupabaseAdminClient()"` or `graphify explain "public.book_slot()"`: where a symbol is defined, what it calls, who uses it, with file and line.
- `graphify path "A()" "B()" --undirected`: how two symbols are connected.
- `graphify query "telegram initData session" --budget 800`: orientation in an unfamiliar area. Ask with code identifiers, not prose; prose matches noise. Then read only the lines it points to.
- Go straight to `rg` for database tables and dictionary keys: the graph misses `.from('table')` calls and most migrations that touch a table (for `data_shares` it showed 3 of 25+ places), and it has no dictionary keys at all. Plain grep also stays the right tool for other exact strings (copy, SQL grants). Don't read `graphify-out/GRAPH_REPORT.md` (about 70 KB) or `graph.json`.
- After large uncommitted edits run `graphify update .` (seconds, no LLM) before asking the graph again. If `graphify-out/graph.json` is missing, the build is still running or failed: check the log and fall back to grep. If there is no log at all (and `command -v graphify` finds nothing), the start hook did not run (for example, the session started outside the repo, in `/home/user`, and this repo's `.claude/settings.json` was not read). Then run `bash scripts/cloud-session-setup.sh` from the repo root once (it also installs the web and bot dependencies); the graph is ready in about a minute.
- Docs and the project folder are not in the graph on purpose: docs are read by name from the list above, and indexing them would need an LLM.

## Infrastructure

- **Hosting**: web on Vercel project `dafit-web` (https://dafit-web-eight.vercel.app), team `rudiks-projects-1924b04c`; bot on Vercel project `dafit-bot` (Root Directory `apps/bot`, webhook), registered by the workflow `Bot setup`; notifications via a DB outbox processed by pg_cron (ADR 0006). `docker-compose.prod.yml` is the post-beta self-hosting path.
- **Backend**: Supabase project `fit` (ref `zxwabddqqtitybtsdeqp`, `us-east-1`). See `docs/adr/0001-supabase-backend.md`.
- **Telegram bot**: `@fitconnection_bot`. Token is server-only (`TELEGRAM_BOT_TOKEN`), never in the repo or client code.
- **Env & secrets**: build as production from day one (`docs/adr/0002-secrets-handling.md`). Every variable is listed in `.env.example` (public vs server-only); `NEXT_PUBLIC_*` only for browser-safe values; server-only vars are read solely via `src/env/server.ts` (`server-only` + zod validation, errors name the variable, never the value); separate keys per environment (local / preview / production). Never read or commit `.env*.local`, never print secret values.
- **Database rules**: RLS on every exposed table; schema changes only via migrations in `supabase/migrations/`, each with pgTAP tests in `supabase/tests/`; run the database checks above after DDL changes. A new migration's timestamp must be later than the latest one on main at merge time and unique (`db push` skips older ones silently); the `Migration order` check enforces it, run `scripts/check-migration-order.sh` after `git fetch origin main` and re-check after merging main in.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `toprudik/fit`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
