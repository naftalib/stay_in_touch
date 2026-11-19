#!/usr/bin/env bash
# Pooler host derivation and hosted psql argv. No network.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=scripts/deploy/lib.sh
source "$root/scripts/deploy/lib.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
log="$tmp/log"
: >"$log"

fail() {
  echo "pooler test failed: $1" >&2
  exit 1
}

assert_eq() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [[ "$got" != "$want" ]]; then
    fail "${label}: got '${got}', want '${want}'"
  fi
}

if grep -nE 'set -x|set -o xtrace' "$root/scripts/deploy/lib.sh" "$root/scripts/deploy/db-push.sh" >/dev/null; then
  fail "xtrace is enabled around the database connection"
fi
if grep -nE 'aws-[0-9]+-|eu-central-1|us-east-1' \
  "$root/scripts/deploy/lib.sh" \
  "$root/scripts/deploy/db-push.sh" \
  "$root/scripts/deploy/pooler_config.py" >/dev/null; then
  fail "a pooler region is hardcoded"
fi

assert_eq "$(host_from_postgres_url 'postgresql://postgres.placeholderref:p@ss@aws-1-eu-central-1.pooler.supabase.com:6543/postgres')" \
  "aws-1-eu-central-1.pooler.supabase.com" \
  "password containing @"
assert_eq "$(host_from_postgres_url 'postgresql://postgres.placeholderref:p%40ss@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require')" \
  "aws-1-eu-central-1.pooler.supabase.com" \
  "encoded @ and query"
assert_eq "$(host_from_postgres_url 'postgresql://postgres.placeholderref:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres')" \
  "aws-0-us-east-1.pooler.supabase.com" \
  "password placeholder"
assert_eq "$(host_from_postgres_url 'postgresql://postgres.placeholderref@aws-1-us-east-1.pooler.supabase.com:5432/postgres')" \
  "aws-1-us-east-1.pooler.supabase.com" \
  "no password in the URL"
assert_eq "$(host_from_postgres_url 'postgresql://postgres@db.placeholderref.supabase.co:5432/postgres')" \
  "db.placeholderref.supabase.co" \
  "direct host parse"

if is_shared_pooler_host "aws-1-eu-central-1.pooler.supabase.com"; then
  :
else
  fail "shared pooler host was rejected"
fi
if is_shared_pooler_host "db.placeholderref.supabase.co"; then
  fail "direct host was accepted as a pooler"
fi
if is_shared_pooler_host "aws-1-eu-central-1.pooler.supabase.com.evil.example"; then
  fail "a suffix attack was accepted"
fi

cat >"$tmp/psql" <<EOF
#!/bin/sh
printf '%s\n' "psql \$*" >> "$log"
exit 0
EOF
cat >"$tmp/curl" <<EOF
#!/bin/sh
printf '%s\n' "curl-invoked" >> "$log"
out=""
prev=""
for arg in "\$@"; do
  case "\$arg" in
    *token-sentinel*|*api-sentinel-password*|*url-sentinel-password*|*not-a-real-password*)
      printf '%s\n' "argv-contained-a-secret" >> "$log"
      ;;
  esac
  if [ "\$prev" = "-o" ]; then
    out="\$arg"
  fi
  prev="\$arg"
done
if [ -n "\$out" ] && [ -f "$tmp/api.json" ]; then
  cp "$tmp/api.json" "\$out"
fi
exit 0
EOF
chmod +x "$tmp/psql" "$tmp/curl"
export PATH="$tmp:$PATH"

export SUPABASE_PROJECT_REF="placeholderref"
export SUPABASE_DB_PASSWORD="not-a-real-password"
export SUPABASE_ACCESS_TOKEN="token-sentinel"
export SUPABASE_POOLER_URL_FILE="$tmp/missing-pooler-url"

# A linked pooler URL wins, including when it still says port 6543.
# curl must not run, so the access token is not required.
cat >"$tmp/pooler-url" <<'EOF'
postgresql://postgres.placeholderref:url-sentinel-password@aws-1-eu-central-1.pooler.supabase.com:6543/postgres
EOF
export SUPABASE_POOLER_URL_FILE="$tmp/pooler-url"
unset SUPABASE_ACCESS_TOKEN || true
: >"$log"
hosted_psql -f "$root/scripts/deploy/realtime-policy.sql" >"$tmp/out" 2>"$tmp/err"
if grep -q 'curl-invoked' "$log"; then
  fail "a valid pooler-url file still called the Management API"
fi
if ! grep -F 'psql host=aws-1-eu-central-1.pooler.supabase.com port=5432 user=postgres.placeholderref dbname=postgres sslmode=require -w -v ON_ERROR_STOP=1 -f '"$root"'/scripts/deploy/realtime-policy.sql' "$log" >/dev/null; then
  cat "$log" >&2
  fail "hosted psql did not use session mode"
fi
if grep -F 'url-sentinel-password' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  fail "the pooler URL password was printed"
fi
if grep -F '6543' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  fail "session mode kept port 6543"
fi
if grep -v '::add-mask::' "$tmp/out" "$tmp/err" | grep -q 'not-a-real-password'; then
  fail "the database password was printed"
fi

# A direct-host cache falls through to the API. Session primary wins over a
# transaction primary and over a replica. connection_string is not used.
export SUPABASE_ACCESS_TOKEN="token-sentinel"
cat >"$tmp/pooler-url" <<'EOF'
postgresql://postgres:url-sentinel-password@db.placeholderref.supabase.co:5432/postgres
EOF
cat >"$tmp/api.json" <<'EOF'
[
  {
    "database_type": "READ_REPLICA",
    "pool_mode": "session",
    "db_host": "aws-9-replica.pooler.supabase.com",
    "db_port": 5432,
    "connection_string": "postgresql://postgres.placeholderref:api-sentinel-password@aws-9-replica.pooler.supabase.com:5432/postgres"
  },
  {
    "database_type": "PRIMARY",
    "pool_mode": "transaction",
    "db_host": "aws-0-us-east-1.pooler.supabase.com",
    "db_port": 6543,
    "connection_string": "postgresql://postgres.placeholderref:api-sentinel-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  },
  {
    "database_type": "PRIMARY",
    "pool_mode": "session",
    "db_host": "aws-1-eu-central-1.pooler.supabase.com",
    "db_port": 5432,
    "connection_string": "postgresql://postgres.placeholderref:api-sentinel-password@secret-host.example:5432/postgres"
  }
]
EOF
: >"$log"
hosted_psql -c 'select 1' >"$tmp/out" 2>"$tmp/err"
if ! grep -q 'curl-invoked' "$log"; then
  fail "direct pooler-url did not fall back to the Management API"
fi
if grep -q 'argv-contained-a-secret' "$log"; then
  fail "curl arguments contained a secret"
fi
if ! grep -F 'host=aws-1-eu-central-1.pooler.supabase.com port=5432 user=postgres.placeholderref dbname=postgres sslmode=require' "$log" >/dev/null; then
  cat "$log" >&2
  fail "API session primary was not used"
fi
if grep -E 'db\.placeholderref|aws-9-replica|aws-0-us-east-1|secret-host|api-sentinel-password|url-sentinel-password|6543' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  fail "a rejected host, port, or connection string leaked into the command"
fi
if grep -v '::add-mask::' "$tmp/out" "$tmp/err" | grep -q 'token-sentinel'; then
  fail "the access token was printed"
fi

# Transaction-only primary still supplies the shared host. The port is forced to 5432.
cat >"$tmp/api.json" <<'EOF'
{
  "database_type": "PRIMARY",
  "pool_mode": "transaction",
  "db_host": "aws-0-ap-southeast-1.pooler.supabase.com",
  "db_port": 6543,
  "connection_string": "postgresql://postgres.placeholderref:api-sentinel-password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
}
EOF
export SUPABASE_POOLER_URL_FILE="$tmp/missing-pooler-url"
: >"$log"
assert_eq "$(pooler_host)" "aws-0-ap-southeast-1.pooler.supabase.com" "transaction-mode primary host"
hosted_psql -c 'select 1' >"$tmp/out" 2>"$tmp/err"
if ! grep -F 'host=aws-0-ap-southeast-1.pooler.supabase.com port=5432 ' "$log" >/dev/null; then
  fail "transaction-mode config was not forced onto session port 5432"
fi
if grep -F 'api-sentinel-password' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  fail "API connection string password was printed"
fi

# A quoted token is refused before curl runs.
export SUPABASE_ACCESS_TOKEN='token"sentinel'
export SUPABASE_POOLER_URL_FILE="$tmp/missing-pooler-url"
: >"$log"
set +e
hosted_psql -c 'select 1' >"$tmp/out" 2>"$tmp/err"
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  fail "a quoted access token was accepted"
fi
if grep -q 'curl-invoked' "$log"; then
  fail "a quoted access token was passed to curl"
fi
if grep -v '::add-mask::' "$tmp/out" "$tmp/err" | grep -F 'token"sentinel' >/dev/null; then
  fail "the quoted access token was printed"
fi
if grep -F 'token"sentinel' "$log" >/dev/null; then
  fail "the quoted access token was passed to curl"
fi

# No file and no usable API: fail closed, and do not call psql.
export SUPABASE_ACCESS_TOKEN="token-sentinel"
rm -f "$tmp/api.json"
cat >"$tmp/curl" <<EOF
#!/bin/sh
printf '%s\n' "curl-invoked" >> "$log"
exit 22
EOF
chmod +x "$tmp/curl"
: >"$log"
set +e
hosted_psql -c 'select 1' >"$tmp/out" 2>"$tmp/err"
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  fail "a missing pooler host was treated as success"
fi
if grep -q '^psql ' "$log"; then
  fail "psql ran without a pooler host"
fi
if grep -v '::add-mask::' "$tmp/out" "$tmp/err" | grep -q 'token-sentinel'; then
  fail "the access token was printed on failure"
fi
if ! grep -q 'could not resolve the Supavisor session pooler host' "$tmp/err"; then
  fail "the failure did not name the pooler"
fi

# A project ref cannot inject extra connection parameters.
export SUPABASE_PROJECT_REF="placeholderref;host=evil.example"
export SUPABASE_POOLER_URL_FILE="$tmp/pooler-url"
: >"$log"
set +e
hosted_psql -c 'select 1' >"$tmp/out" 2>"$tmp/err"
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  fail "an unsafe project ref was accepted"
fi
if grep -q '^psql ' "$log"; then
  fail "psql ran with an unsafe project ref"
fi

echo "pooler test passed"
