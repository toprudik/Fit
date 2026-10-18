# Scenario suite

User scenarios with a real sign-in and a real database: each role's flows from `docs/architecture/screens.md` §4 and the PRD, on a phone (390 px) and a computer (1280 px).

## Run

```sh
supabase start -x studio,edge-runtime,logflare,vector,supavisor,mailpit,realtime   # repo root, once
apps/web/scripts/e2e-scenarios.sh                       # build for the local database, then every scenario
E2E_SKIP_BUILD=1 apps/web/scripts/e2e-scenarios.sh trainer --project=phone   # one file, current build
```

The suite refuses any database but a local one. It never runs as a required PR check: it needs Docker and a build of its own.

## How a scenario is written

- People come from `support/fixtures.ts`: `trainer`, `client` (already trains with `trainer`), `admin`, and `persona({ firstName })` for anyone else. Each test gets new accounts with made-up names and Telegram ids from 9 000 000 000 up, so tests run in parallel and leave each other alone.
- Sign-in is the app's own: initData signed like Telegram signs it goes to `POST /api/auth/telegram/mini-app`, which creates the account and sets the session cookies in the persona's browser.
- Set the scene through the RPCs the screens use, as the persona (`persona.db.rpc(...)`, under RLS). `adminDb()` bypasses RLS and is only for what no user can do, such as the admin role.
- Drive the thing under test through the screen: roles, labels and visible text, written out in the test rather than read from the dictionaries, so a wrong string fails.
- Every screen a scenario lands on passes axe (`expectAccessible` from `e2e/support.ts`).
- Visual snapshots live in `visual.spec.ts` only (tests tagged `@visual`), with dates, times and names that change per run masked. Week grids still change with the weekday, so baselines are not kept in git: make them on main, then compare your branch the same day.

```sh
git switch main && apps/web/scripts/e2e-scenarios.sh visual --update-snapshots
git switch -   && apps/web/scripts/e2e-scenarios.sh visual   # differences land in test-results/scenarios
```
