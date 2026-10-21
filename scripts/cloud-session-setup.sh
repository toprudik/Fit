#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions, wired in .claude/settings.json.
# Installs dependencies for apps/web and apps/bot and exports the public build
# variables CI uses, so lint, typecheck, tests and build work from the first
# command. Outside cloud sessions it exits right away and changes nothing.

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
logs="${TMPDIR:-/tmp}"
report=()

web="$root/apps/web"
marker="$web/node_modules/.package-lock.json"
if [ -f "$marker" ] && [ ! "$web/package-lock.json" -nt "$marker" ]; then
  report+=("apps/web: dependencies already installed")
elif (cd "$web" && npm ci --no-audit --no-fund >"$logs/cloud-setup-web.log" 2>&1); then
  report+=("apps/web: npm ci done")
else
  report+=("apps/web: npm ci failed, log in $logs/cloud-setup-web.log")
fi

if (cd "$root/apps/bot" && uv sync --frozen >"$logs/cloud-setup-bot.log" 2>&1); then
  report+=("apps/bot: uv sync done")
else
  report+=("apps/bot: uv sync failed, log in $logs/cloud-setup-bot.log")
fi

# Code graph for cheaper code questions (CLAUDE.md, "Code graph"). About 30 s, so
# it runs in the background and the session does not wait for it.
nohup setsid bash "$root/scripts/graphify-setup.sh" >"$logs/graphify-setup.log" 2>&1 </dev/null &
report+=("graphify: building the code graph in the background, log in $logs/graphify-setup.log")

# next build reads these at build time. The values match .github/workflows/ci.yml.
# A value set on the cloud environment wins, so real keys can replace them there.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  exported=()
  export_default() {
    if [ -z "${!1:-}" ]; then
      printf 'export %s=%q\n' "$1" "$2" >>"$CLAUDE_ENV_FILE"
      exported+=("$1")
    fi
  }
  export_default NEXT_PUBLIC_APP_URL https://fit.example
  export_default NEXT_PUBLIC_SUPABASE_URL https://zxwabddqqtitybtsdeqp.supabase.co
  export_default NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sb_publishable_ci_placeholder
  if [ "${#exported[@]}" -gt 0 ]; then
    report+=("CI placeholder values exported for ${exported[*]}")
  fi
fi

printf 'Cloud session setup:\n'
printf -- '- %s\n' "${report[@]}"
exit 0
