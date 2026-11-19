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

# Shared pooler hostname. The region cluster index is part of the name, so a
# region alone is not enough to build it. ADR 0111.
is_shared_pooler_host() {
  local host="${1,,}"
  [[ "$host" =~ ^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)*\.pooler\.supabase\.com$ ]]
}

# Prints the host from a postgres URL. The value may contain a password, so
# callers must not echo the URL. A password's '@' is the last one before the host.
host_from_postgres_url() {
  local url="$1"
  local rest authority hostport host
  url="${url//$'\r'/}"
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"
  if [[ -z "$url" ]]; then
    return 1
  fi
  rest="$url"
  if [[ "$rest" == *"://"* ]]; then
    rest="${rest#*://}"
  fi
  rest="${rest%%\?*}"
  rest="${rest%%#*}"
  authority="${rest%%/*}"
  hostport="$authority"
  if [[ "$authority" == *@* ]]; then
    hostport="${authority##*@}"
  fi
  if [[ -z "$hostport" ]]; then
    return 1
  fi
  if [[ "$hostport" == \[* ]]; then
    host="${hostport#\[}"
    host="${host%%\]*}"
  else
    host="${hostport%%:*}"
  fi
  host="${host,,}"
  if [[ -z "$host" || "$host" == *"/"* || "$host" == *"@"* || "$host" == *" "* ]]; then
    return 1
  fi
  printf '%s' "$host"
}

# supabase link writes this file. SUPABASE_POOLER_URL_FILE overrides the path
# in tests. The file is an internal CLI cache: its port may be 6543 and its
# userinfo may hold a password placeholder. Only the hostname is used.
pooler_host_from_file() {
  local file="${SUPABASE_POOLER_URL_FILE:-$REPO_ROOT/supabase/.temp/pooler-url}"
  local url host
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  url="$(tr -d '\r\n' <"$file")"
  if [[ -z "$url" ]]; then
    echo "pooler-url did not contain a host; trying the Management API" >&2
    return 1
  fi
  if ! host="$(host_from_postgres_url "$url")"; then
    echo "pooler-url did not contain a host; trying the Management API" >&2
    return 1
  fi
  if ! is_shared_pooler_host "$host"; then
    echo "pooler-url is not a shared pooler host; trying the Management API" >&2
    return 1
  fi
  printf '%s' "$host"
}

# GET /v1/projects/{ref}/config/database/pooler. Uses db_host only.
# connection_string is ignored because it embeds a password placeholder.
pooler_host_from_api() {
  require_names SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF
  mask_value "$SUPABASE_ACCESS_TOKEN"
  if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{1,40}$ ]]; then
    echo "SUPABASE_PROJECT_REF is not a project ref" >&2
    return 1
  fi
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to read the Supabase pooler config" >&2
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required to read the Supabase pooler config" >&2
    return 1
  fi
  local host
  # The access token stays in a config file, not in curl's arguments.
  if ! host="$(
    body="$(mktemp)"
    trap 'wipe_file "$body" "${cfg:-}"' EXIT
    cfg="$(mktemp)"
    umask 077
    if [[ "$SUPABASE_ACCESS_TOKEN" == *$'\n'* || "$SUPABASE_ACCESS_TOKEN" == *'"'* ]]; then
      echo "SUPABASE_ACCESS_TOKEN cannot be passed to curl" >&2
      exit 1
    fi
    printf 'header = "Accept: application/json"\nheader = "Authorization: Bearer %s"\n' \
      "$SUPABASE_ACCESS_TOKEN" >"$cfg"
    if ! curl --fail --silent --show-error \
      --proto '=https' --tlsv1.2 \
      --retry 2 --retry-delay 1 \
      --max-time 30 \
      --config "$cfg" \
      -o "$body" \
      -- "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/database/pooler"
    then
      exit 1
    fi
    python3 "$REPO_ROOT/scripts/deploy/pooler_config.py" "$body"
  )"; then
    return 1
  fi
  host="${host//$'\r'/}"
  host="${host#"${host%%[![:space:]]*}"}"
  host="${host%"${host##*[![:space:]]}"}"
  host="${host,,}"
  if ! is_shared_pooler_host "$host"; then
    echo "Management API pooler host was not the shared pooler" >&2
    return 1
  fi
  printf '%s' "$host"
}

# Host the CLI just linked, then the Management API. Never a guessed region.
pooler_host() {
  local host
  if host="$(pooler_host_from_file)"; then
    printf '%s' "$host"
    return 0
  fi
  pooler_host_from_api
}

hosted_psql() {
  require_names SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD
  mask_value "$SUPABASE_DB_PASSWORD"
  if [[ ! "$SUPABASE_PROJECT_REF" =~ ^[a-z0-9]{1,40}$ ]]; then
    echo "SUPABASE_PROJECT_REF is not a project ref" >&2
    return 1
  fi
  local host
  if ! host="$(pooler_host)"; then
    echo "could not resolve the Supavisor session pooler host" >&2
    return 1
  fi
  # Password stays in the environment, not on the command line.
  # Session mode is port 5432 even when the cached URL says 6543.
  # -w refuses a password prompt so a failed login cannot hang the job.
  echo "session pooler host=${host} port=5432" >&2
  PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
    "host=${host} port=5432 user=postgres.${SUPABASE_PROJECT_REF} dbname=postgres sslmode=require" \
    -w \
    -v ON_ERROR_STOP=1 \
    "$@"
}
