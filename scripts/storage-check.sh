#!/usr/bin/env bash
# Print photo and database percentages only. Exit 1 at 80% or above.
# STORAGE_CHECK_DB_CAP_BYTES is ignored unless STORAGE_CHECK_ALLOW_CAP_OVERRIDE=1.
# The monthly workflow does not set the override. The default cap is 500 MiB.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/deploy/lib.sh"

target="${1:-local}"
case "$target" in
  local | test | production) ;;
  *)
    echo "storage-check target must be local, test, or production" >&2
    exit 1
    ;;
esac

db_cap="524288000"
if [[ "${STORAGE_CHECK_ALLOW_CAP_OVERRIDE:-}" == "1" && -n "${STORAGE_CHECK_DB_CAP_BYTES:-}" ]]; then
  db_cap="$STORAGE_CHECK_DB_CAP_BYTES"
fi

if [[ ! "$db_cap" =~ ^[0-9]+$ ]]; then
  echo "database cap must be a positive integer" >&2
  exit 1
fi

query="select case when cap = 0 then 0 else round(100.0 * used / cap, 1) end, round(100.0 * pg_database_size(current_database())::numeric / ${db_cap}, 1) from (select coalesce(sum(case when med.status = 'ready' then coalesce(med.size_bytes, 0) + coalesce(med.expected_thumb_bytes, 0) when med.status = 'pending' then coalesce(med.expected_bytes, 0) + coalesce(med.expected_thumb_bytes, 0) else 0 end), 0)::numeric as used, private.photo_storage_cap_bytes()::numeric as cap from public.media med) photo;"

if [[ "$target" == "local" ]]; then
  line="$(local_psql -At -F ' ' -c "$query")"
else
  line="$(hosted_psql -At -F ' ' -c "$query")"
fi

photo="${line%% *}"
database="${line##* }"
echo "photo_storage_percent=${photo}"
echo "database_percent=${database}"

awk -v p="$photo" -v d="$database" 'BEGIN { exit ((p+0) >= 80 || (d+0) >= 80) ? 1 : 0 }'
