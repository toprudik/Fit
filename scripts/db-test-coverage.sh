#!/usr/bin/env bash
# Lists what the pgTAP suite never reaches in the local database: functions in public/private that no test calls,
# and `raise exception '...'` messages that no test file mentions. Turns on track_functions, resets the counters,
# runs `supabase test db`, then reads pg_stat_user_functions. Exits 1 when a function is never called.
#
# A SQL function the planner inlines is not counted, so it can show up here although a test reaches it; check
# such a line by hand. An error branch tested by SQLSTATE only (throws_ok without the message) shows up too.
#
# Usage: scripts/db-test-coverage.sh   (after `supabase db start`; local only, never against a hosted project)
set -euo pipefail

project=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)
container="${SUPABASE_DB_CONTAINER:-supabase_db_$project}"
psql() { docker exec -i "$container" psql -U supabase_admin -d postgres -qAt -v ON_ERROR_STOP=1 "$@"; }

if [ "$(psql -c 'show track_functions')" != "all" ]; then
  psql -c "alter system set track_functions = 'all'" -c 'select pg_reload_conf()' > /dev/null
fi
psql -c 'select pg_stat_reset()' > /dev/null
supabase test db > /dev/null

uncalled=$(psql -c "
  select n.nspname || '.' || p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join pg_stat_user_functions s on s.funcid = p.oid
  where n.nspname in ('public', 'private') and s.funcid is null
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  order by 1")
total=$(psql -c "select count(*) from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)")

untested_raises=$(psql -F '|' -c "
  select distinct n.nspname || '.' || p.proname, m[1]
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace,
  lateral regexp_matches(p.prosrc, 'raise\s+exception\s+''([^'']+)''', 'gi') m
  where n.nspname in ('public', 'private')
  order by 1, 2" | while IFS='|' read -r fn message; do
    key=$(printf '%s' "$message" | sed 's/%.*//' | cut -c1-40)
    grep -qF -- "$key" supabase/tests/*.sql || printf '%s: %s\n' "$fn" "$message"
  done)

echo "Functions never called by the suite: $(printf '%s' "$uncalled" | grep -c . || true) of $total"
[ -n "$uncalled" ] && printf '  %s\n' $uncalled
echo "Error messages no test mentions: $(printf '%s' "$untested_raises" | grep -c . || true)"
[ -n "$untested_raises" ] && printf '%s\n' "$untested_raises" | sed 's/^/  /'
[ -z "$uncalled" ]
