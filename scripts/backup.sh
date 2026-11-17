#!/usr/bin/env bash
# Encrypted database dump. Prints only the age file path.
# Usage: backup.sh <local|test|production>
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/deploy/lib.sh"

target="${1:?usage: backup.sh <local|test|production>}"
case "$target" in
  local | test | production) ;;
  *)
    echo "backup target must be local, test, or production" >&2
    exit 1
    ;;
esac

require_names BACKUP_AGE_RECIPIENT
cd "$REPO_ROOT"
mkdir -p "$REPO_ROOT/backups"
stamp="$(date -u +%Y-%m-%d)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

exclude_args=()
if [[ "$target" == "local" ]]; then
  present="$(local_psql -At -c "select coalesce(to_regclass('storage.buckets_vectors')::text, '') || ',' || coalesce(to_regclass('storage.vector_indexes')::text, '')")"
else
  require_names SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD
  bash "$REPO_ROOT/scripts/deploy/link.sh" >&2
  present="$(hosted_psql -At -c "select coalesce(to_regclass('storage.buckets_vectors')::text, '') || ',' || coalesce(to_regclass('storage.vector_indexes')::text, '')")"
fi

if [[ "$present" == *"buckets_vectors"* ]]; then
  exclude_args+=(-x storage.buckets_vectors)
fi
if [[ "$present" == *"vector_indexes"* ]]; then
  exclude_args+=(-x storage.vector_indexes)
fi

remote_args=()
if [[ "$target" != "local" ]]; then
  remote_args=(--remote --yes)
fi

roles=(supabase db dump -f "$work/roles.sql" --role-only "${remote_args[@]}")
schema=(supabase db dump -f "$work/schema.sql" "${remote_args[@]}")
data=(supabase db dump -f "$work/data.sql" --data-only --use-copy "${exclude_args[@]}" "${remote_args[@]}")
refuse_seed "${roles[@]}"
refuse_seed "${schema[@]}"
refuse_seed "${data[@]}"
"${roles[@]}" >&2
"${schema[@]}" >&2
"${data[@]}" >&2

tar -C "$work" -cf "$work/backup.tar" roles.sql schema.sql data.sql
out="$REPO_ROOT/backups/backup-${target}-${stamp}.tar.age"
age -r "$BACKUP_AGE_RECIPIENT" -o "$out" "$work/backup.tar"
wipe_file "$work/roles.sql" "$work/schema.sql" "$work/data.sql" "$work/backup.tar"
echo "$out"
