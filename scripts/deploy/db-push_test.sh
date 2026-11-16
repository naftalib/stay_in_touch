#!/usr/bin/env bash
# Fake the CLI and prove a hosted push repairs the Realtime migration once.
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

export PATH="$tmp:$PATH"
export SUPABASE_PROJECT_REF="placeholderref"
export SUPABASE_DB_PASSWORD="not-a-real-password"
bash "$root/scripts/deploy/db-push.sh" production >"$tmp/out" 2>"$tmp/err"
if ! grep -q 'repaired' "$log"; then
  echo "repair was not called" >&2
  cat "$log" >&2
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
echo "db-push repair test passed"
