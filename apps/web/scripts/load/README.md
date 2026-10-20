# Load runs

A load run on the local stand: this checkout's `next start` and the local Supabase, filled with made-up users.
Never against production (dafit-web-eight.vercel.app), the hosted Supabase or Telegram: every URL comes from
`supabase status`, and both scripts refuse any host but localhost.

## Run

From `apps/web`, with Docker and the Supabase CLI (2.121.0) installed:

```sh
supabase start            # from the repo root, once
scripts/load/run.sh       # build, seed, start the app on :3200, run, stop it
```

Options: `--no-build` reuses `.next` (built by an earlier `run.sh`, since the build bakes in the local Supabase URL),
`--seed "-v trainers=20 -v clients=25 -v big=300"` sets the data size, and the rest goes to `run.mjs`:
`--stages 10x60,25x60,50x60` (virtual users × seconds per stage), `--report report.md`.

The run exits 1 when a target is missed. After the table it prints the statements that took the most database time,
from `pg_stat_statements`, reset at the start of the run.

## What it does

- `seed.sql` deletes the previous load users and creates `trainers` trainers with `clients` clients each, plus one
  trainer (`load_big`) with `big` clients. Each pair gets a pass, two weeks of food diary, steps and water, and the
  trainer three sessions a day from a week ago to a week ahead. Telegram ids start at 7 700 000 000; nobody real has
  them. It reuses the pgTAP fixture helpers (`supabase/tests/_helpers.psql`), so the data has the shape the tests check.
- `run.mjs` signs every load user in through the real Mini App sign-in (`POST /api/auth/telegram/mini-app` with
  initData signed by the made-up bot token the server was started with), then keeps the virtual users busy:
  80 % clients (five screens, a food entry, water, a food search), 15 % trainers (six screens and the nutrition
  adherence RPC), 5 % the big roster trainer. A page counts as an error unless it answers 200: a redirect means the
  session or the consent did not hold.

## Targets

| What | p95 | Source |
|---|---|---|
| API reads and writes (PostgREST RPC) | 300 ms | docs/prd/quality.md §1 |
| A page (server render) | 1500 ms | ours: one machine runs the app and the database |
| Sign-in | 2000 ms | ours |
| Errors | under 1 % per request type | ours |

Reports of past runs: `reports/load-*.md` in the project files.
