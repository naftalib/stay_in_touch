#!/usr/bin/env bash
# Shared helpers for deploy, backup, and restore.
# Do not enable xtrace. Workflow logs are public.

set -euo pipefail

# Used by every script that sources this file.
# shellcheck disable=SC2034
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

refuse_seed() {
  local joined="$*"
  if [[ "$joined" == *"--include-seed"* || "$joined" == *"seed.sql"* || "$joined" == *" --seed"* || "$joined" == *" --seed="* ]]; then
    echo "refusing to run seed.sql or --include-seed" >&2
    exit 1
  fi
}

require_names() {
  local missing=()
  local name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      missing+=("$name")
    fi
  done
  if ((${#missing[@]} > 0)); then
    echo "missing required name: ${missing[*]}" >&2
    exit 1
  fi
}

mask_value() {
  local value="${1:-}"
  if [[ -n "$value" ]]; then
    # stderr so command substitution does not swallow the Actions mask.
    echo "::add-mask::${value}" >&2
  fi
}

sql_quote() {
  local value="${1-}"
  value="${value//\'/\'\'}"
  printf "%s" "$value"
}

wipe_file() {
  local path
  for path in "$@"; do
    if [[ -f "$path" ]]; then
      if command -v shred >/dev/null 2>&1; then
        shred -u "$path" || rm -f "$path"
      else
        rm -f "$path"
      fi
    fi
  done
}

local_psql() {
  PGPASSWORD=postgres psql \
    -h 127.0.0.1 \
    -p 54322 \
    -U postgres \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    "$@"
}

hosted_psql() {
  require_names SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD
  mask_value "$SUPABASE_DB_PASSWORD"
  # Password stays in the environment, not on the command line.
  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    "postgresql://postgres@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres" \
    -v ON_ERROR_STOP=1 \
    "$@"
}
