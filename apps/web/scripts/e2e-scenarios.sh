#!/usr/bin/env bash
# Signed-in scenarios (e2e-scenarios/) against the local Supabase.
#
#   supabase start            # at the repo root, once
#   apps/web/scripts/e2e-scenarios.sh [playwright args]   # e.g. --project=phone trainer
#
# Builds the app for the local database (NEXT_PUBLIC_* are baked into the build), unless
# E2E_SKIP_BUILD=1 says the current .next already is that build. Keys come from `supabase status`
# and are never written anywhere. Note: afterwards .next points at the local database; the plain
# e2e suite does not mind, but rebuild before deploying anything by hand.
set -euo pipefail
cd "$(dirname "$0")/.."

status=$(supabase status -o json --workdir ../.. 2>/dev/null) || {
  echo "No local Supabase: run \`supabase start\` at the repo root first." >&2
  exit 1
}
field() { python3 -c 'import json,sys; print(json.load(sys.stdin)[sys.argv[1]])' "$1" <<<"$status"; }

export NEXT_PUBLIC_SUPABASE_URL=$(field API_URL)
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(field PUBLISHABLE_KEY)
export SUPABASE_SECRET_KEY=$(field SECRET_KEY)
export E2E_SCENARIOS_PORT=${E2E_SCENARIOS_PORT:-3200}
export NEXT_PUBLIC_APP_URL=http://localhost:$E2E_SCENARIOS_PORT
export TELEGRAM_BOT_TOKEN=1:e2e-scenarios

if [ "${E2E_SKIP_BUILD:-}" != 1 ]; then npm run build; fi
exec npx playwright test --config playwright.scenarios.config.ts "$@"
