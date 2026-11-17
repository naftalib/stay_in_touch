#!/usr/bin/env bash
# Restore an age-encrypted dump. Refuses production unless --i-mean-production.
# Usage: restore.sh <file.tar.age> <local|test|production> [--i-mean-production]
# Identity file: AGE_IDENTITY_FILE (default key.txt). Never commit it.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/deploy/lib.sh"

archive="${1:?usage: restore.sh <file.tar.age> <target> [--i-mean-production]}"
target="${2:?usage: restore.sh <file.tar.age> <target> [--i-mean-production]}"
flag="${3:-}"

case "$target" in
  local | test | production) ;;
  *)
    echo "restore target must be local, test, or production" >&2
    exit 1
    ;;
esac

if [[ "$target" == "production" && "$flag" != "--i-mean-production" ]]; then
  echo "refusing to restore into production without --i-mean-production" >&2
  exit 1
fi

if [[ ! -f "$archive" ]]; then
  echo "backup file not found" >&2
  exit 1
fi

identity="${AGE_IDENTITY_FILE:-key.txt}"
if [[ ! -f "$identity" ]]; then
  echo "age identity file is missing (AGE_IDENTITY_FILE)" >&2
  exit 1
fi

if git -C "$REPO_ROOT" ls-files --error-unmatch -- "$identity" >/dev/null 2>&1; then
  echo "refusing to read an age identity that git tracks" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

age -d -i "$identity" -o "$work/backup.tar" "$archive"
tar -C "$work" -xf "$work/backup.tar"

run_sql() {
  local file="$1"
  if [[ "$target" == "local" ]]; then
    local_psql -f "$file"
  else
    require_names SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD
    hosted_psql -f "$file"
  fi
}

# Roles often cannot sit in a transaction with schema.
# A database that already ran migrations answers CREATE TYPE with "already exists".
# That is the local drill (db reset, then restore): keep the migrated schema and
# load data. An empty database takes the schema file as written.
run_sql "$work/roles.sql" || echo "role restore reported errors; continuing with schema and data" >&2
set +e
run_sql "$work/schema.sql" >"$work/schema.out" 2>"$work/schema.err"
schema_status=$?
set -e
if [[ "$schema_status" -ne 0 ]]; then
  if grep -q 'already exists' "$work/schema.err"; then
    echo "schema already exists from migrations; loading data into those tables" >&2
  else
    cat "$work/schema.err" >&2
    exit "$schema_status"
  fi
fi

# The data dump is COPY. Clear the tables it fills so a migrated database,
# which already has the photos bucket and the storage cap row, can accept it.
# Replica mode turns off foreign-key triggers, including the messages cycle.
truncate_list="$(
  python3 - "$work/data.sql" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
names = re.findall(r'^COPY\s+("[^"]+"\."[^"]+")', text, re.M)
if not names:
    sys.exit(0)
print("truncate table " + ", ".join(names) + " cascade;")
PY
)"

data_wrap="$work/data-wrapped.sql"
{
  echo "begin;"
  echo "set session_replication_role = replica;"
  if [[ -n "$truncate_list" ]]; then
    printf '%s\n' "$truncate_list"
  fi
  cat "$work/data.sql"
  echo "commit;"
} >"$data_wrap"
run_sql "$data_wrap"

unsched="$work/unsched.sql"
cat >"$unsched" <<'SQL'
do $do$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job;
exception
  when undefined_table or undefined_function then
    null;
end
$do$;
SQL
run_sql "$unsched"

wipe_file "$work/roles.sql" "$work/schema.sql" "$work/data.sql" "$work/backup.tar" "$data_wrap" "$unsched"
echo "restore finished"
echo "Vault secrets are not in the dump. Run hosted-setup to put them back and reschedule jobs."
echo "Do not restore production data into the test project."
