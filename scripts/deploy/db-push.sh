#!/usr/bin/env bash
# Dry-run, then push. Never passes --include-seed.
# On a hosted project, migration 20261112160007 fails closed because local
# dblink cannot run there. This script then installs the policy as postgres
# (supautils allows that) and marks that one version applied.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

target="${1:?usage: db-push.sh <local|test|production>}"
cd "$REPO_ROOT"
unset SUPABASE_DB_SEED_ENABLED || true

remote_args=()
if [[ "$target" != "local" ]]; then
  remote_args=(--remote --yes)
fi

dry=(supabase db push --dry-run "${remote_args[@]}")
apply=(supabase db push "${remote_args[@]}")
refuse_seed "${dry[@]}"
refuse_seed "${apply[@]}"

echo "pending migrations:"
set +e
dry_out="$("${dry[@]}" 2>&1)"
dry_status=$?
set -e
printf '%s\n' "$dry_out"
if [[ "$dry_status" -ne 0 ]]; then
  exit "$dry_status"
fi

set +e
push_out="$("${apply[@]}" 2>&1)"
push_status=$?
set -e
printf '%s\n' "$push_out"
if [[ "$push_status" -eq 0 ]]; then
  exit 0
fi

if [[ "$target" == "local" ]]; then
  exit "$push_status"
fi

if [[ "$push_out" != *"cannot install the realtime viewer policy"* && "$push_out" != *"must be owner of table messages"* ]]; then
  exit "$push_status"
fi

echo "realtime policy migration needs the hosted postgres path; repairing 20261112160007"
hosted_psql -f "$REPO_ROOT/scripts/deploy/realtime-policy.sql"
repair=(supabase migration repair 20261112160007 --status applied --remote --yes)
refuse_seed "${repair[@]}"
"${repair[@]}"
retry=(supabase db push --remote --yes)
refuse_seed "${retry[@]}"
"${retry[@]}"
