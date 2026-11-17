#!/usr/bin/env bash
# Push Auth config for one remote. Clears stray SUPABASE_* values so they
# cannot override the [remotes.*] block (CLI 3). Restores the names the
# later steps still need.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

target="${1:?usage: config-push.sh <test|production>}"
cd "$REPO_ROOT"

require_names SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF APP_URL GMAIL_SMTP_USER GMAIL_SMTP_PASS

saved_token="${SUPABASE_ACCESS_TOKEN}"
saved_password="${SUPABASE_DB_PASSWORD:-}"
saved_url="${SUPABASE_URL:-}"
saved_ref="${SUPABASE_PROJECT_REF}"

while IFS= read -r name; do
  case "$name" in
    SUPABASE_ACCESS_TOKEN | SUPABASE_DB_PASSWORD | SUPABASE_ENV | SUPABASE_INTERNAL_*) ;;
    *) unset "$name" ;;
  esac
done < <(env | awk -F= '/^SUPABASE_/ {print $1}')

export SUPABASE_ENV="$target"
export APP_REDIRECT_ALLOW="${APP_URL}/**"
if [[ "$target" == "test" ]]; then
  export SUPABASE_REMOTES_TEST_PROJECT_ID="$saved_ref"
  unset SUPABASE_REMOTES_PRODUCTION_PROJECT_ID || true
else
  export SUPABASE_REMOTES_PRODUCTION_PROJECT_ID="$saved_ref"
  unset SUPABASE_REMOTES_TEST_PROJECT_ID || true
fi
export SUPABASE_ACCESS_TOKEN="$saved_token"
if [[ -n "$saved_password" ]]; then
  export SUPABASE_DB_PASSWORD="$saved_password"
fi

supabase config push --yes
echo "config push finished for ${target}"

export SUPABASE_PROJECT_REF="$saved_ref"
if [[ -n "$saved_url" ]]; then
  export SUPABASE_URL="$saved_url"
fi
