#!/usr/bin/env bash
# Restores an encrypted copy made by backup.sh into an EMPTY Supabase database (a new project, or a fresh
# `supabase start` without this repo's migrations), then checks that every table has as many rows as the copy.
#
#   DB_BACKUP_PASSPHRASE=... scripts/db-backup/restore.sh dafit-db-2026-10-21.tar.gpg "postgresql://..."
#
# Output is safe for a public CI log: psql reports errors as SQLSTATE codes only, query results are dropped,
# and the check prints table names, never rows or counts. PSQL overrides the psql command, e.g. to run it in
# Docker from the same Postgres image ("docker run --rm -i --network host --entrypoint psql <image>").
set -euo pipefail

file="${1:?usage: restore.sh <copy.tar.gpg> <target-db-url>}"
target="${2:?usage: restore.sh <copy.tar.gpg> <target-db-url>}"
: "${DB_BACKUP_PASSPHRASE:?DB_BACKUP_PASSPHRASE is not set}"
read -r -a psql <<<"${PSQL:-psql}"

umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export GNUPGHOME="$work/gnupg"
mkdir "$GNUPGHOME" "$work/dump"

if ! gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$file" 3< <(printf '%s' "$DB_BACKUP_PASSPHRASE") |
  tar -C "$work/dump" -xzf -; then
  echo "Could not open $file: wrong DB_BACKUP_PASSPHRASE, or the file is damaged." >&2
  exit 1
fi

q() { "${psql[@]}" --dbname "$target" --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never "$@"; }

# The order and the replica role (no triggers, no FK checks while loading) follow Supabase's restore guide.
# Everything goes in on stdin so that PSQL may run in a container that cannot see these files.
# Roles go first and on their own: a new project already has Supabase's roles, and a statement only the platform
# may run (e.g. GRANT SET ON PARAMETER) fails there without harm: such errors show up above as SQLSTATE codes.
q -v ON_ERROR_STOP=0 --file - <"$work/dump/roles.sql" >/dev/null
# Empty tables are skipped: there is nothing to load, and some platform tables (e.g. storage.buckets_vectors)
# do not let the postgres role write to them even with zero rows.
{
  cat "$work/dump/schema.sql"
  echo 'SET session_replication_role = replica;'
  awk '/^COPY .* FROM stdin;$/ { held = $0; next } held != "" && $0 == "\\." { held = ""; next }
       held != "" { print held; held = "" } { print }' "$work/dump/data.sql"
} | q --single-transaction --file - >/dev/null
echo "Restored schema and data."

# Expected rows per non-empty table: in COPY text format every row is one line between "COPY ... FROM stdin;" and "\.".
awk '/^COPY .* FROM stdin;$/ { t = $2; n = 0; next } t != "" && $0 == "\\." { if (n > 0) print t "\t" n; t = ""; next } t != "" { n++ }' \
  "$work/dump/data.sql" >"$work/expected.tsv"

tables=0
bad=0
while IFS=$'\t' read -r table want; do
  tables=$((tables + 1))
  got=$(q --command "select count(*) from $table" </dev/null)
  if [ "$got" != "$want" ]; then
    echo "::error::Row count differs after restore: $table"
    bad=$((bad + 1))
  fi
done <"$work/expected.tsv"

if [ "$bad" -ne 0 ]; then
  echo "$bad of $tables tables differ."
  exit 1
fi
echo "All $tables non-empty tables in the copy have the same number of rows after restore."
