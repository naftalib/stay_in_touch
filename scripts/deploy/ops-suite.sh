#!/usr/bin/env bash
# Local proofs against a running, seeded Supabase stack.
# Backup drill, bootstrap, hosted-setup, and the 79/81 storage fixtures.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$REPO_ROOT"

status_env="$(supabase status -o env)"
api_url="$(printf '%s\n' "$status_env" | awk -F= '/^API_URL=/{print substr($0, index($0, "=")+1)}' | tr -d '"')"
publishable="$(printf '%s\n' "$status_env" | awk -F= '/^(ANON_KEY|PUBLISHABLE_KEY)=/{print substr($0, index($0, "=")+1); exit}' | tr -d '"')"
secret="$(printf '%s\n' "$status_env" | awk -F= '/^(SECRET_KEY|SERVICE_ROLE_KEY)=/{print substr($0, index($0, "=")+1); exit}' | tr -d '"')"
if [[ -z "$api_url" || -z "$publishable" || -z "$secret" ]]; then
  echo "supabase status did not include the local URL and keys" >&2
  exit 1
fi

env_file="$REPO_ROOT/.env.test.local"
umask 077
cat >"$env_file" <<EOF
SUPABASE_URL=$api_url
SUPABASE_SECRET_KEY=$secret
APP_URL=http://127.0.0.1:5173
EMAIL_TRANSPORT=mailpit
EMAIL_FROM=Stay In Touch <no-reply@example.test>
MAILPIT_URL=http://127.0.0.1:54324
EOF
trap 'rm -f "$env_file" "$REPO_ROOT/.env.production.local"' EXIT

export SUPABASE_URL="$api_url"
export VITE_SUPABASE_URL="$api_url"
export VITE_SUPABASE_PUBLISHABLE_KEY="$publishable"
export APP_URL="http://127.0.0.1:5173"
export VAPID_PUBLIC_KEY="fake-vapid-public"
export VAPID_SUBJECT="mailto:admin@example.test"
export VITE_VAPID_PUBLIC_KEY="fake-vapid-public"
export VAPID_PRIVATE_KEY="fake-vapid-private"
export PUSH_SEND_SECRET="local-push-dev"
export MEDIA_CLEANUP_SECRET="local-cleanup-dev"
export GMAIL_SMTP_USER="sender@example.test"
export EMAIL_FROM="Stay In Touch <sender@example.test>"
export GMAIL_SMTP_PASS="sentinel-do-not-print"
export EMAIL_TRANSPORT="gmail"

echo "reset to the seeded local database"
supabase db reset --yes >/dev/null

echo "local deploy path"
deploy_out="$(DEPLOY_TARGET=local bash "$REPO_ROOT/scripts/deploy/deploy.sh")"
printf '%s\n' "$deploy_out" | grep -q 'secrets_file_deleted=1'
printf '%s\n' "$deploy_out" | grep -q 'hosted-setup finished'
if printf '%s\n' "$deploy_out" | grep -q 'sentinel-do-not-print'; then
  echo "a secret value was printed by the local deploy" >&2
  exit 1
fi

echo "hosted-setup is safe to run twice"
bash "$REPO_ROOT/scripts/deploy/hosted-setup.sh" local

echo "hosted-setup recreates cleanup-orphan-invite-users after it is removed"
local_psql -c "select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-orphan-invite-users';"
bash "$REPO_ROOT/scripts/deploy/hosted-setup.sh" local
orphan="$(local_psql -At -c "select count(*) from cron.job where jobname = 'cleanup-orphan-invite-users'")"
if [[ "$orphan" != "1" ]]; then
  echo "cleanup-orphan-invite-users was not recreated (got ${orphan})" >&2
  exit 1
fi

echo "bootstrap refuses missing email settings before it creates a user"
cat >"$env_file" <<EOF
SUPABASE_URL=$api_url
SUPABASE_SECRET_KEY=$secret
APP_URL=http://127.0.0.1:5173
EOF
set +e
pnpm bootstrap:family --env test --force --family "No Mail" --email "nomail@example.test" --label "Mom" >/tmp/boot-nomail.out 2>&1
nomail_status=$?
set -e
if [[ "$nomail_status" -eq 0 ]]; then
  echo "bootstrap should have refused missing EMAIL_TRANSPORT" >&2
  exit 1
fi
if ! grep -q 'EMAIL_TRANSPORT' /tmp/boot-nomail.out; then
  echo "missing email settings were not named" >&2
  cat /tmp/boot-nomail.out >&2
  exit 1
fi
if [[ "$(local_psql -At -c "select count(*) from auth.users where email = 'nomail@example.test'")" != "0" ]]; then
  echo "bootstrap created a user before checking email settings" >&2
  exit 1
fi

echo "bootstrap refuses a hosted project in Actions before it creates a user"
hosted_env="$REPO_ROOT/.env.production.local"
cat >"$hosted_env" <<'EOF'
SUPABASE_URL=https://example.supabase.co
SUPABASE_SECRET_KEY=example-only
APP_URL=https://stay-in-touch.example.workers.dev
EMAIL_TRANSPORT=gmail
GMAIL_SMTP_USER=sender@example.test
GMAIL_SMTP_PASS=example-app-password
EMAIL_FROM=Stay In Touch <sender@example.test>
EOF
set +e
GITHUB_ACTIONS=true pnpm bootstrap:family --env production --family "Nope" --email "nobody@example.test" --label "Mom" >/tmp/boot-hosted.out 2>&1
hosted_status=$?
set -e
rm -f "$hosted_env"
if [[ "$hosted_status" -eq 0 ]]; then
  echo "bootstrap should have refused a hosted URL in Actions" >&2
  exit 1
fi
if ! grep -q 'hosted project' /tmp/boot-hosted.out; then
  echo "hosted Actions refusal was not the hosted-project error" >&2
  cat /tmp/boot-hosted.out >&2
  exit 1
fi
if [[ "$(local_psql -At -c "select count(*) from auth.users where email = 'nobody@example.test'")" != "0" ]]; then
  echo "bootstrap created a user before refusing the hosted Actions run" >&2
  exit 1
fi

cat >"$env_file" <<EOF
SUPABASE_URL=$api_url
SUPABASE_SECRET_KEY=$secret
APP_URL=http://127.0.0.1:5173
EMAIL_TRANSPORT=mailpit
EMAIL_FROM=Stay In Touch <no-reply@example.test>
MAILPIT_URL=http://127.0.0.1:54324
EOF

echo "bootstrap refuses a populated project without --force"
set +e
pnpm bootstrap:family --env test --family "Ops Bootstrap" --email "ops-parent@example.test" --label "Mom" >/tmp/boot.out 2>&1
boot_status=$?
set -e
if [[ "$boot_status" -eq 0 ]]; then
  echo "bootstrap should have refused" >&2
  exit 1
fi
# pnpm prints the command line. The program output must not repeat the address.
if grep -v 'bootstrap-family.ts' /tmp/boot.out | grep -q 'ops-parent@example.test'; then
  echo "bootstrap logged the email address" >&2
  exit 1
fi

echo "bootstrap with --force on the local stack, including when Actions is set"
GITHUB_ACTIONS=true pnpm bootstrap:family --env test --force --family "Ops Bootstrap" --email "ops-parent@example.test" --label "Mom" >/tmp/boot.out 2>&1
if grep -v 'bootstrap-family.ts' /tmp/boot.out | grep -q 'ops-parent@example.test'; then
  echo "bootstrap logged the email address" >&2
  exit 1
fi
families_after="$(local_psql -At -c "select count(*) from public.families where name = 'Ops Bootstrap'")"
if [[ "$families_after" != "1" ]]; then
  echo "expected one Ops Bootstrap family, got ${families_after}" >&2
  exit 1
fi

python3 - <<'PY'
import json, urllib.request
messages = json.load(urllib.request.urlopen("http://127.0.0.1:54324/api/v1/messages?limit=50"))
found = False
for message in messages.get("messages", []):
    for entry in message.get("To") or []:
        address = (entry.get("Address") or entry.get("address") or "").lower()
        if address == "ops-parent@example.test":
            found = True
if not found:
    raise SystemExit("invite email did not arrive")
print("invite email arrived")
PY

echo "bootstrap again does not add a family"
GITHUB_ACTIONS=true pnpm bootstrap:family --env test --force --family "Ops Bootstrap" --email "ops-parent@example.test" --label "Mom" >/tmp/boot.out 2>&1
families_again="$(local_psql -At -c "select count(*) from public.families where name = 'Ops Bootstrap'")"
if [[ "$families_again" != "1" ]]; then
  echo "re-run created another family" >&2
  exit 1
fi

echo "storage fixtures"
local_psql -c "update private.app_limits set photo_storage_cap_bytes = (select ceil(greatest(coalesce(sum(case when status = 'ready' then coalesce(size_bytes, 0) + coalesce(expected_thumb_bytes, 0) when status = 'pending' then coalesce(expected_bytes, 0) + coalesce(expected_thumb_bytes, 0) else 0 end), 0), 1) / 0.79)::bigint from public.media);"
if ! bash "$REPO_ROOT/scripts/storage-check.sh" local >/tmp/storage79.out; then
  echo "79% storage check should pass" >&2
  cat /tmp/storage79.out >&2
  exit 1
fi
if grep -Eq 'family|@|/[0-9a-f-]{8}' /tmp/storage79.out; then
  echo "storage check printed more than percentages" >&2
  exit 1
fi
local_psql -c "update private.app_limits set photo_storage_cap_bytes = (select ceil(greatest(coalesce(sum(case when status = 'ready' then coalesce(size_bytes, 0) + coalesce(expected_thumb_bytes, 0) when status = 'pending' then coalesce(expected_bytes, 0) + coalesce(expected_thumb_bytes, 0) else 0 end), 0), 1) / 0.81)::bigint from public.media);"
set +e
bash "$REPO_ROOT/scripts/storage-check.sh" local >/tmp/storage81.out
storage_status=$?
set -e
if [[ "$storage_status" -eq 0 ]]; then
  echo "81% storage check should fail" >&2
  exit 1
fi
local_psql -c "update private.app_limits set photo_storage_cap_bytes = 838860800;"

db_size="$(local_psql -At -c "select pg_database_size(current_database())")"
cap79=$((db_size * 100 / 79))
if ! STORAGE_CHECK_ALLOW_CAP_OVERRIDE=1 STORAGE_CHECK_DB_CAP_BYTES="$cap79" bash "$REPO_ROOT/scripts/storage-check.sh" local >/dev/null; then
  echo "79% database check should pass" >&2
  exit 1
fi
cap81=$((db_size * 100 / 81))
set +e
STORAGE_CHECK_ALLOW_CAP_OVERRIDE=1 STORAGE_CHECK_DB_CAP_BYTES="$cap81" bash "$REPO_ROOT/scripts/storage-check.sh" local >/dev/null
db_status=$?
set -e
if [[ "$db_status" -eq 0 ]]; then
  echo "81% database check should fail" >&2
  exit 1
fi

echo "backup and restore drill"
before_families="$(local_psql -At -c "select count(*) from public.families")"
before_members="$(local_psql -At -c "select count(*) from public.family_members")"
before_messages="$(local_psql -At -c "select count(*) from public.messages")"
before_users="$(local_psql -At -c "select count(*) from auth.users")"

identity_dir="$(mktemp -d)"
identity="$identity_dir/key.txt"
age-keygen -o "$identity" 2>"$identity.pub"
recipient="$(awk '/Public key:/ {print $3}' "$identity.pub")"
export BACKUP_AGE_RECIPIENT="$recipient"
export AGE_IDENTITY_FILE="$identity"
archive="$(bash "$REPO_ROOT/scripts/backup.sh" local)"
supabase db reset --no-seed --yes
bash "$REPO_ROOT/scripts/restore.sh" "$archive" local

after_families="$(local_psql -At -c "select count(*) from public.families")"
after_members="$(local_psql -At -c "select count(*) from public.family_members")"
after_messages="$(local_psql -At -c "select count(*) from public.messages")"
after_users="$(local_psql -At -c "select count(*) from auth.users")"
if [[ "$before_families" != "$after_families" || "$before_members" != "$after_members" || "$before_messages" != "$after_messages" || "$before_users" != "$after_users" ]]; then
  echo "restore counts differ families ${before_families}->${after_families} members ${before_members}->${after_members} messages ${before_messages}->${after_messages} users ${before_users}->${after_users}" >&2
  exit 1
fi

echo "hosted-setup after restore puts the three jobs back"
bash "$REPO_ROOT/scripts/deploy/hosted-setup.sh" local
jobs="$(local_psql -At -c "select count(*) from cron.job where jobname in ('push-send-sweep', 'media-cleanup-daily', 'cleanup-orphan-invite-users')")"
if [[ "$jobs" != "3" ]]; then
  echo "expected 3 cron jobs after restore and hosted-setup, got ${jobs}" >&2
  local_psql -c "select jobname from cron.job order by jobname" >&2 || true
  exit 1
fi

sign_in="$(mktemp)"
code="$(curl -s -o "$sign_in" -w '%{http_code}' \
  -H "apikey: ${publishable}" \
  -H "Content-Type: application/json" \
  -d '{"email":"mom@example.test","password":"local-dev-only"}' \
  "${api_url}/auth/v1/token?grant_type=password")"
rm -f "$sign_in"
if [[ "$code" != "200" ]]; then
  echo "Mom could not sign in after restore (HTTP ${code})" >&2
  exit 1
fi

set +e
bash "$REPO_ROOT/scripts/restore.sh" "$archive" production >/tmp/restore-prod.out 2>&1
prod_status=$?
set -e
if [[ "$prod_status" -eq 0 ]]; then
  echo "restore should refuse production" >&2
  exit 1
fi
if ! grep -q -- '--i-mean-production' /tmp/restore-prod.out; then
  echo "production refusal did not name the flag" >&2
  exit 1
fi

rm -rf "$identity_dir"
echo "ops suite passed"
