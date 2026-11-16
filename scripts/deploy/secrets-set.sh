#!/usr/bin/env bash
# Write function secrets to a temp env file, then delete it.
# Hosted: supabase secrets set --env-file. Local: the file is the proof.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

target="${1:?usage: secrets-set.sh <local|test|production>}"
cd "$REPO_ROOT"

require_names \
  APP_URL SUPABASE_URL \
  GMAIL_SMTP_USER GMAIL_SMTP_PASS EMAIL_FROM \
  MEDIA_CLEANUP_SECRET PUSH_SEND_SECRET \
  VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT

transport="${EMAIL_TRANSPORT:-gmail}"
if [[ "$target" != "local" ]]; then
  transport="gmail"
fi

umask 077
tmp="$(mktemp)"
trap 'wipe_file "$tmp"' EXIT

{
  printf 'EMAIL_TRANSPORT=%s\n' "$transport"
  printf 'GMAIL_SMTP_USER=%s\n' "$GMAIL_SMTP_USER"
  printf 'GMAIL_SMTP_PASS=%s\n' "$GMAIL_SMTP_PASS"
  printf 'EMAIL_FROM=%s\n' "$EMAIL_FROM"
  printf 'APP_URL=%s\n' "$APP_URL"
  printf 'MEDIA_PROVIDER=%s\n' "${MEDIA_PROVIDER:-supabase}"
  printf 'MEDIA_BUCKET=%s\n' "${MEDIA_BUCKET:-photos}"
  printf 'MEDIA_PUBLIC_BASE_URL=%s\n' "${SUPABASE_URL%/}"
  printf 'MEDIA_UPLOAD_MAX_BYTES=%s\n' "${MEDIA_UPLOAD_MAX_BYTES:-5242880}"
  printf 'MEDIA_CLEANUP_SECRET=%s\n' "$MEDIA_CLEANUP_SECRET"
  printf 'PUSH_TRANSPORT=%s\n' "${PUSH_TRANSPORT:-webpush}"
  printf 'PUSH_SEND_SECRET=%s\n' "$PUSH_SEND_SECRET"
  printf 'VAPID_PUBLIC_KEY=%s\n' "$VAPID_PUBLIC_KEY"
  printf 'VAPID_PRIVATE_KEY=%s\n' "$VAPID_PRIVATE_KEY"
  printf 'VAPID_SUBJECT=%s\n' "$VAPID_SUBJECT"
} >"$tmp"

echo "secrets file keys: EMAIL_TRANSPORT GMAIL_SMTP_USER GMAIL_SMTP_PASS EMAIL_FROM APP_URL MEDIA_PROVIDER MEDIA_BUCKET MEDIA_PUBLIC_BASE_URL MEDIA_UPLOAD_MAX_BYTES MEDIA_CLEANUP_SECRET PUSH_TRANSPORT PUSH_SEND_SECRET VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT"

if [[ "$target" == "local" ]]; then
  wipe_file "$tmp"
  trap - EXIT
  echo "secrets_file_deleted=1"
  exit 0
fi

require_names SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF
supabase secrets set --env-file "$tmp" --yes
wipe_file "$tmp"
trap - EXIT
echo "secrets_file_deleted=1"
