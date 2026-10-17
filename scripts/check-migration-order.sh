#!/usr/bin/env bash
# Fails when a migration this branch adds is not newer than every migration on the base branch, or when two
# migrations share a timestamp. `supabase db push` (no --include-all) silently skips a migration older than the
# last one applied in production, so such a file would never reach the hosted database.
#
# Usage: scripts/check-migration-order.sh [base-ref]   (default origin/main; fetch it first so it is current)
set -euo pipefail

base="${1:-origin/main}"
dir="supabase/migrations"

stamps() { sed -n 's#^\([0-9]\{14\}\)_.*\.sql$#\1#p'; }

base_files=$(git ls-tree --name-only "$base" "$dir/" | sed "s#^$dir/##" | sort)
head_files=$(find "$dir" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)
new_files=$(comm -13 <(echo "$base_files") <(echo "$head_files"))

latest=$(echo "$base_files" | stamps | sort | tail -n 1)
latest_file=$(echo "$base_files" | grep "^${latest}_" | head -n 1)

if [ -z "$new_files" ]; then
  echo "No new migrations. Latest on $base: $latest_file"
  exit 0
fi

# A suggestion that is later than the latest migration and, unlike a round time, unlikely to clash.
now=$(date -u +%Y%m%d%H%M%S)
suggest=$(( now > latest ? now : latest + 1 ))

fail=0
for f in $new_files; do
  stamp=$(echo "$f" | stamps)
  if [ -z "$stamp" ]; then
    echo "::error file=$dir/$f::$f: the name must be <14-digit UTC timestamp>_<name>.sql."
    fail=1
    continue
  fi
  if [ "$stamp" -le "$latest" ]; then
    echo "::error file=$dir/$f::$f: timestamp $stamp is not later than the latest migration on $base ($latest_file). Production would skip it. Rename it to ${suggest}_${f#*_} (any timestamp later than $latest works) and update references to the old name."
    fail=1
  fi
done

dupes=$( (echo "$base_files"; echo "$new_files") | stamps | sort | uniq -d)
for d in $dupes; do
  echo "::error file=$dir/$(echo "$new_files" | grep "^${d}_" | head -n 1)::Timestamp $d is used by more than one migration: $( (echo "$base_files"; echo "$new_files") | grep "^${d}_" | tr '\n' ' ')Give the new one a unique later timestamp, for example $suggest."
  fail=1
done

if [ "$fail" -eq 0 ]; then
  echo "New migrations are later than $latest_file on $base:"
  echo "$new_files"
fi
exit "$fail"
