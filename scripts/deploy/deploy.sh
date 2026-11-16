#!/usr/bin/env bash
# Full deploy. Production refuses to start unless BACKUP_CONFIRMED=1.
# Never use set -x.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

target="${DEPLOY_TARGET:?set DEPLOY_TARGET to local, test, or production}"
case "$target" in
  local | test | production) ;;
  *)
    echo "DEPLOY_TARGET must be local, test, or production" >&2
    exit 1
    ;;
esac

cd "$REPO_ROOT"
here="$(dirname "$0")"

if [[ "$target" == "local" ]]; then
  require_names \
    SUPABASE_URL VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY APP_URL \
    VAPID_PUBLIC_KEY VAPID_SUBJECT VITE_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY \
    PUSH_SEND_SECRET MEDIA_CLEANUP_SECRET \
    GMAIL_SMTP_USER EMAIL_FROM GMAIL_SMTP_PASS
else
  require_names \
    SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD \
    SUPABASE_URL VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY APP_URL \
    CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID \
    VAPID_PUBLIC_KEY VAPID_SUBJECT VITE_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY \
    PUSH_SEND_SECRET MEDIA_CLEANUP_SECRET \
    GMAIL_SMTP_USER EMAIL_FROM GMAIL_SMTP_PASS
  if [[ "$target" == "production" ]]; then
    require_names BACKUP_AGE_RECIPIENT
    if [[ "${BACKUP_CONFIRMED:-}" != "1" ]]; then
      echo "production deploy requires a successful backup first (BACKUP_CONFIRMED=1)" >&2
      exit 1
    fi
  fi
  echo "step: link"
  bash "$here/link.sh"
fi

echo "step: database push"
bash "$here/db-push.sh" "$target"

if [[ "$target" != "local" ]]; then
  echo "step: config push"
  bash "$here/config-push.sh" "$target"
fi

echo "step: function secrets"
bash "$here/secrets-set.sh" "$target"

if [[ "$target" != "local" ]]; then
  echo "step: functions deploy"
  bash "$here/functions-deploy.sh"
fi

echo "step: hosted setup"
bash "$here/hosted-setup.sh" "$target"

if [[ "$target" != "local" ]]; then
  echo "step: web deploy"
  bash "$here/web-deploy.sh" "$target"
fi

if [[ -n "${POST_DEPLOY_URL:-}" ]]; then
  echo "step: post-deploy check"
  deno run --allow-net "$REPO_ROOT/scripts/post-deploy-check.ts" "$POST_DEPLOY_URL"
fi

echo "deploy steps finished"
