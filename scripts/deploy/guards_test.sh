#!/usr/bin/env bash
# Guard tests that do not need a database.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

fail() {
  echo "guard test failed: $1" >&2
  exit 1
}

set +e
(refuse_seed supabase db push --include-seed) >/tmp/refuse-seed.out 2>&1
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  fail "--include-seed was allowed"
fi
if ! grep -q 'seed' /tmp/refuse-seed.out; then
  fail "seed refusal did not name seed"
fi

set +e
(refuse_seed psql -f supabase/seed.sql) >/tmp/refuse-seed.out 2>&1
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  fail "seed.sql was allowed"
fi

unset SUPABASE_DB_PASSWORD || true
export SUPABASE_ACCESS_TOKEN="sentinel-token-value-should-not-print"
set +e
out="$(require_names SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD 2>&1)"
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  fail "missing name was allowed"
fi
if ! grep -q 'SUPABASE_DB_PASSWORD' <<<"$out"; then
  fail "missing name was not named"
fi
if grep -q 'sentinel-token-value-should-not-print' <<<"$out"; then
  fail "a secret value was printed"
fi

backup="$REPO_ROOT/.github/workflows/backup.yml"
deploy="$REPO_ROOT/.github/workflows/deploy.yml"

if grep -E '^[[:space:]]+(actions|pull-requests|id-token|checks|packages|deployments|security-events|statuses|attestations):' "$backup" >/dev/null; then
  fail "backup.yml grants more than contents: read"
fi
if grep -E '^[[:space:]]+actions:' "$deploy" >/dev/null; then
  fail "deploy.yml grants an actions permission"
fi
if ! grep -q 'environment: production' "$backup"; then
  fail "backup.yml must use the production environment"
fi
if grep -q 'production-backup' "$backup"; then
  fail "backup.yml must not name a reviewer-less backup environment"
fi
needle="ref: \${{ inputs.git_sha || github.sha }}"
if ! grep -F "$needle" "$backup" >/dev/null; then
  fail "backup checkout must use inputs.git_sha || github.sha"
fi
if grep -q "event_name == 'workflow_call'" "$backup"; then
  fail "backup must not gate git_sha on event_name workflow_call"
fi
if ! grep -q "github.ref == 'refs/heads/main'" "$backup"; then
  fail "backup workflow_dispatch must stay on main"
fi
if ! grep -q 'schedule_cleanup_orphan_invite_users' "$REPO_ROOT/scripts/deploy/hosted-setup.sh"; then
  fail "hosted-setup must recreate cleanup-orphan-invite-users"
fi

echo "guard tests passed"
rm -f /tmp/refuse-seed.out
