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

echo "guard tests passed"
rm -f /tmp/refuse-seed.out
