#!/usr/bin/env bash
# Dumps a database (roles, schema, data, as in Supabase's own backup guide) and writes it as one file
# encrypted with a passphrase: tar.gz inside, OpenPGP symmetric AES-256 outside. The plain dump lives only in a
# private temp directory that is removed on exit, so nothing unencrypted leaves the machine.
#
#   SUPABASE_DB_URL=... DB_BACKUP_PASSPHRASE=... scripts/db-backup/backup.sh out.tar.gpg
#
# Storage files (photos and other uploads) are not in the database and so not in this copy. Restore with
# scripts/db-backup/restore.sh. Needs the Supabase CLI (it runs pg_dump in Docker) and gpg.
set -euo pipefail

out="${1:?usage: backup.sh <out.tar.gpg>}"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${DB_BACKUP_PASSPHRASE:?DB_BACKUP_PASSPHRASE is not set}"

umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export GNUPGHOME="$work/gnupg"
mkdir "$GNUPGHOME"

mkdir "$work/dump"
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$work/dump/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/dump/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$work/dump/data.sql"

mkdir -p "$(dirname "$out")"
# The passphrase goes in on a file descriptor, never on a command line where `ps` could show it.
tar -C "$work/dump" -czf - roles.sql schema.sql data.sql |
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --output "$out" 3< <(printf '%s' "$DB_BACKUP_PASSPHRASE")

echo "Encrypted copy written: $out ($(du -h "$out" | cut -f1))"
