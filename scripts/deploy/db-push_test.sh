#!/usr/bin/env bash
# Fake the CLI and prove a hosted push repairs the Realtime migration once,
# over the session pooler, without printing the database password.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
log="$tmp/log"
: >"$log"

cat >"$tmp/supabase" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$log"
if [ "\$1" = "db" ] && [ "\$2" = "push" ] && printf '%s' "\$*" | grep -q dry-run; then
  echo "20261112160007_realtime_policy.sql"
  exit 0
fi
if [ "\$1" = "db" ] && [ "\$2" = "push" ]; then
  if [ ! -f "$tmp/pushed" ]; then
    touch "$tmp/pushed"
    echo "cannot install the realtime viewer policy" >&2
    exit 1
  fi
  echo "pushed"
  exit 0
fi
if [ "\$1" = "migration" ] && [ "\$2" = "repair" ]; then
  echo "repaired" >> "$log"
  exit 0
fi
echo "unexpected supabase \$*" >&2
exit 1
EOF
cat >"$tmp/psql" <<EOF
#!/bin/sh
printf '%s\n' "psql \$*" >> "$log"
exit 0
EOF
chmod +x "$tmp/supabase" "$tmp/psql"

# Cached URL uses the transaction-mode port and a different password than the
# environment. The repair must keep neither.
cat >"$tmp/pooler-url" <<'EOF'
postgresql://postgres.placeholderref:url-sentinel-password@aws-1-eu-central-1.pooler.supabase.com:6543/postgres
EOF

export PATH="$tmp:$PATH"
export SUPABASE_PROJECT_REF="placeholderref"
export SUPABASE_DB_PASSWORD="not-a-real-password"
export SUPABASE_POOLER_URL_FILE="$tmp/pooler-url"
unset SUPABASE_ACCESS_TOKEN || true

bash "$root/scripts/deploy/db-push.sh" production >"$tmp/out" 2>"$tmp/err"

if ! grep -qx 'migration repair 20261112160007 --status applied --remote --yes' "$log"; then
  echo "repair command was not the hosted repair" >&2
  cat "$log" >&2
  exit 1
fi
if ! grep -q 'repaired' "$log"; then
  echo "repair was not called" >&2
  cat "$log" >&2
  exit 1
fi
if ! grep -F 'psql host=aws-1-eu-central-1.pooler.supabase.com port=5432 user=postgres.placeholderref dbname=postgres sslmode=require -w -v ON_ERROR_STOP=1 -f '"$root"'/scripts/deploy/realtime-policy.sql' "$log" >/dev/null; then
  echo "repair did not use the session pooler" >&2
  cat "$log" >&2
  exit 1
fi
if grep -F 'db.placeholderref.supabase.co' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  echo "repair used the direct database host" >&2
  exit 1
fi
if grep -F '6543' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  echo "repair kept the transaction-mode port" >&2
  exit 1
fi
if grep -F 'url-sentinel-password' "$log" "$tmp/out" "$tmp/err" >/dev/null; then
  echo "password from the pooler URL was printed" >&2
  exit 1
fi
if grep -v '::add-mask::' "$tmp/out" "$tmp/err" | grep -q 'not-a-real-password'; then
  echo "database password was printed" >&2
  exit 1
fi
if ! grep -q '::add-mask::not-a-real-password' "$tmp/err"; then
  echo "database password was not masked" >&2
  exit 1
fi
if ! grep -q '20261112160007' "$tmp/out"; then
  echo "pending migration name was not printed" >&2
  exit 1
fi
if ! grep -F 'session pooler host=aws-1-eu-central-1.pooler.supabase.com port=5432' "$tmp/err" >/dev/null; then
  echo "session pooler host was not logged" >&2
  exit 1
fi

# A local failure must not open a hosted connection.
: >"$log"
rm -f "$tmp/pushed"
cat >"$tmp/supabase" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$log"
if [ "\$1" = "db" ] && [ "\$2" = "push" ] && printf '%s' "\$*" | grep -q dry-run; then
  echo "local pending"
  exit 0
fi
if [ "\$1" = "db" ] && [ "\$2" = "push" ]; then
  echo "local push failed" >&2
  exit 7
fi
echo "unexpected supabase \$*" >&2
exit 1
EOF
chmod +x "$tmp/supabase"
set +e
bash "$root/scripts/deploy/db-push.sh" local >"$tmp/local-out" 2>"$tmp/local-err"
local_status=$?
set -e
if [[ "$local_status" -ne 7 ]]; then
  echo "local push status was ${local_status}, expected 7" >&2
  exit 1
fi
if grep -q 'psql ' "$log"; then
  echo "local push called psql" >&2
  exit 1
fi
if grep -q 'migration repair' "$log"; then
  echo "local push repaired a hosted migration" >&2
  exit 1
fi

echo "db-push repair test passed"
