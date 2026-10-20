#!/usr/bin/env bash
# One load run on the local stand: build the app against the local Supabase, seed made-up users, start
# `next start`, run the scenarios, stop the server. Needs the local Supabase running (`supabase start`).
#
#   scripts/load/run.sh [--no-build] [--seed "-v trainers=20 -v clients=25 -v big=300"] [run.mjs options…]
#
# Run from apps/web. Never against production: every URL comes from `supabase status` and localhost.
set -euo pipefail
cd "$(dirname "$0")/../.."

build=1
seed_vars="-v trainers=20 -v clients=25 -v big=300"
pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) build=0 ;;
    --seed) seed_vars="$2"; shift ;;
    *) pass+=("$1") ;;
  esac
  shift
done

status="$(cd ../.. && supabase status -o env)"
value() { printf '%s\n' "$status" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"; }
api="$(value API_URL)"
db="$(value DB_URL)"
case "$api" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "Supabase is not local: $api" >&2; exit 2 ;; esac

port="${LOAD_PORT:-3200}"
app="http://127.0.0.1:$port"
export NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_APP_URL="$app"
export NEXT_PUBLIC_SUPABASE_URL="$api"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(value PUBLISHABLE_KEY)"

if [ "$build" = 1 ]; then
  npm run build
fi

psql "$db" -X -q $seed_vars -f scripts/load/seed.sql

if curl -s -o /dev/null "$app/login"; then
  echo "Port $port is taken: stop that server or set LOAD_PORT." >&2
  exit 2
fi

# Server secrets of the local stand only: the local secret key and a made-up bot token (no Telegram call is made).
export LOAD_BOT_TOKEN="1:load-placeholder"
SUPABASE_SECRET_KEY="$(value SECRET_KEY)" TELEGRAM_BOT_TOKEN="$LOAD_BOT_TOKEN" TELEGRAM_LOGIN_CLIENT_ID=load \
  TELEGRAM_LOGIN_CLIENT_SECRET=load setsid node_modules/.bin/next start -p "$port" >"${TMPDIR:-/tmp}/load-next.log" 2>&1 &
server=$!
# setsid gives the server its own process group, so the whole group (next-server forks) stops with the run.
trap 'kill -- -$server 2>/dev/null || true' EXIT
for _ in $(seq 60); do
  curl -sf -o /dev/null "$app/login" && break
  kill -0 $server 2>/dev/null || { echo "next start exited:" >&2; tail -20 "${TMPDIR:-/tmp}/load-next.log" >&2; exit 2; }
  sleep 1
done

# Statement statistics of this run only: the report lists the queries that took the most database time.
psql "$db" -X -q -c "select extensions.pg_stat_statements_reset()" >/dev/null
status=0
node scripts/load/run.mjs --app "$app" "${pass[@]}" || status=$?
echo
echo "Top statements by total database time during the run:"
psql "$db" -X -P pager=off -c "
  select calls, round(total_exec_time) as total_ms, round(mean_exec_time::numeric, 2) as mean_ms,
         left(regexp_replace(query, '\s+', ' ', 'g'), 140) as query
  from extensions.pg_stat_statements
  where query !~* 'pg_stat_statements' and userid <> 'supabase_admin'::regrole
  order by total_exec_time desc limit 15"
exit $status
