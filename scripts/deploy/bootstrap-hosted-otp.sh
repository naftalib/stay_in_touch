#!/usr/bin/env bash
# Bootstrap against local Auth configured like the hosted projects:
# public signup off, email confirmations on. Then request a sign-in code.
# The committed config.toml is restored before this script exits.
# ADR 0103 keeps local confirmations off. ADR 0112 is why this override exists.

set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$REPO_ROOT"

config="$REPO_ROOT/supabase/config.toml"
backup="$(mktemp)"
cp "$config" "$backup"
restarted=0

restart_local_supabase() {
  supabase stop --no-backup >/tmp/supabase-stop.out 2>&1 || true
  local attempt
  for attempt in 1 2 3 4 5; do
    if supabase start -x realtime,studio,imgproxy,logflare,vector,supavisor,edge-runtime >/tmp/supabase-start.out 2>&1; then
      return 0
    fi
    echo "supabase start failed (attempt ${attempt}), retrying..." >&2
    sleep 5
  done
  cat /tmp/supabase-start.out >&2
  return 1
}

cleanup() {
  local status=$?
  if [[ -f "$backup" ]]; then
    cp "$backup" "$config"
    rm -f "$backup"
  fi
  if [[ "$restarted" == "1" && "${GITHUB_ACTIONS:-}" != "true" ]]; then
    restart_local_supabase || status=1
  fi
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    if ! git -C "$REPO_ROOT" diff --exit-code -- supabase/config.toml >/dev/null; then
      echo "supabase/config.toml was left modified" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

python3 - <<'PY'
from pathlib import Path
path = Path("supabase/config.toml")
text = path.read_text()
email_at = text.find("[auth.email]")
sms_at = text.find("[auth.sms]")
flag = text.find("enable_confirmations = false")
if email_at < 0 or sms_at < 0 or flag < 0 or not (email_at < flag < sms_at):
    raise SystemExit("refusing to change confirmations outside local [auth.email]")
rate = text.find("email_sent = 2")
if rate < 0 or rate > email_at:
    raise SystemExit("local email_sent = 2 was not in [auth.rate_limit]")
text = text[:flag] + "enable_confirmations = true" + text[flag + len("enable_confirmations = false"):]
text = text.replace("email_sent = 2", "email_sent = 60", 1)
if text.count("enable_confirmations = false") != 1:
    raise SystemExit("expected only the sms confirmations flag to stay false")
if text.count("enable_confirmations = true") < 3:
    raise SystemExit("expected local email confirmations on, plus the two remotes")
path.write_text(text)
PY

restarted=1
restart_local_supabase

status_env="$(supabase status -o env)"
api_url="$(printf '%s\n' "$status_env" | awk -F= '/^API_URL=/{print substr($0, index($0, "=")+1)}' | tr -d '"')"
publishable="$(printf '%s\n' "$status_env" | awk -F= '/^(ANON_KEY|PUBLISHABLE_KEY)=/{print substr($0, index($0, "=")+1); exit}' | tr -d '"')"
secret="$(printf '%s\n' "$status_env" | awk -F= '/^(SECRET_KEY|SERVICE_ROLE_KEY)=/{print substr($0, index($0, "=")+1); exit}' | tr -d '"')"
if [[ -z "$api_url" || -z "$publishable" || -z "$secret" ]]; then
  echo "supabase status did not include the local URL and keys" >&2
  exit 1
fi

export OTP_API="$api_url"
export OTP_KEY="$publishable"
export OTP_SECRET="$secret"

python3 - <<'PY'
import json, os, urllib.request
req = urllib.request.Request(
    os.environ["OTP_API"] + "/auth/v1/settings",
    headers={"apikey": os.environ["OTP_KEY"]},
)
with urllib.request.urlopen(req) as res:
    data = json.load(res)
if data.get("disable_signup") is not True or data.get("mailer_autoconfirm") is not False:
    raise SystemExit(
        "auth settings are not hosted-like: disable_signup=%s mailer_autoconfirm=%s"
        % (data.get("disable_signup"), data.get("mailer_autoconfirm"))
    )
print("auth settings match hosted signup-off confirmations-on")
PY

# GoTrue loads the magic-link file from Kong and caches a failed fetch for
# about 10 seconds. Until the next reload, the letter is the built-in one,
# which has no 6-digit code.
wait_for_magic_template() {
  local body mark now tries
  tries=0
  while [[ "$tries" -lt 30 ]]; do
    body="$(docker exec supabase_auth_stay-in-touch wget -qO- http://supabase_kong_stay-in-touch:8088/email/magic_link.html 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q 'Your sign-in code'; then
      break
    fi
    tries=$((tries + 1))
    sleep 1
  done
  if ! printf '%s' "$body" | grep -q 'Your sign-in code'; then
    echo "magic link template was not served" >&2
    return 1
  fi
  mark="$(docker logs supabase_auth_stay-in-touch 2>&1 | grep -c 'reloaded template type: magic_link' || true)"
  tries=0
  while [[ "$tries" -lt 30 ]]; do
    now="$(docker logs supabase_auth_stay-in-touch 2>&1 | grep -c 'reloaded template type: magic_link' || true)"
    if [[ "$now" -gt "$mark" ]]; then
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done
  echo "auth did not reload the magic link template" >&2
  return 1
}
wait_for_magic_template

python3 - <<'PY'
import json, os, urllib.error, urllib.request
body = json.dumps({
    "email": "hosted-repair@example.test",
    "email_confirm": False,
    "user_metadata": {"display_name": "Mom"},
}).encode()
req = urllib.request.Request(
    os.environ["OTP_API"] + "/auth/v1/admin/users",
    data=body,
    headers={
        "apikey": os.environ["OTP_SECRET"],
        "Authorization": "Bearer " + os.environ["OTP_SECRET"],
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req) as res:
        res.read()
except urllib.error.HTTPError as caught:
    raise SystemExit("could not prepare the unconfirmed user (HTTP %s)" % caught.code) from None
print("prepared unconfirmed user")
PY

# Admin create can still mark the row confirmed. The hosted bug was an unconfirmed row.
local_psql -c "update auth.users set email_confirmed_at = null where email = 'hosted-repair@example.test'" >/dev/null
if [[ "$(local_psql -At -c "select case when email_confirmed_at is null then 'no' else 'yes' end from auth.users where email = 'hosted-repair@example.test'")" != "no" ]]; then
  echo "the repair user was not unconfirmed" >&2
  exit 1
fi

otp_code() {
  local email="$1"
  local out="$2"
  curl -sS -o "$out" -w '%{http_code}' \
    -H "apikey: ${publishable}" \
    -H "Authorization: Bearer ${publishable}" \
    -H "Content-Type: application/json" \
    --data-binary "{\"email\":\"${email}\",\"create_user\":false}" \
    "${api_url}/auth/v1/otp"
}

repair_otp="$(otp_code "hosted-repair@example.test" /tmp/otp-repair.json)"
if [[ "$repair_otp" != "422" ]]; then
  echo "unconfirmed sign-in code should be 422, got ${repair_otp}" >&2
  exit 1
fi
python3 - <<'PY'
import json
from pathlib import Path
body = json.loads(Path("/tmp/otp-repair.json").read_text() or "{}")
flat = json.dumps(body)
if "signup_disabled" not in flat:
    raise SystemExit("unconfirmed sign-in was not signup_disabled")
print("unconfirmed sign-in is signup_disabled")
PY

run_bootstrap() {
  local family="$1"
  local email="$2"
  local status
  set +e
  pnpm bootstrap:family --env test --force --family "$family" --email "$email" --label "Mom" >/tmp/boot-otp.out 2>&1
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "bootstrap failed" >&2
    grep -v '@' /tmp/boot-otp.out >&2 || true
    exit 1
  fi
  if grep -v 'bootstrap-family.ts' /tmp/boot-otp.out | grep -q "$email"; then
    echo "bootstrap logged an email address" >&2
    exit 1
  fi
}

run_bootstrap "Hosted Repair" "hosted-repair@example.test"
if [[ "$(local_psql -At -c "select case when email_confirmed_at is null then 'no' else 'yes' end from auth.users where email = 'hosted-repair@example.test'")" != "yes" ]]; then
  echo "bootstrap did not confirm the existing user" >&2
  exit 1
fi

since="$(date +%s)"
repair_ok="$(otp_code "hosted-repair@example.test" /tmp/otp-repair-ok.json)"
if [[ "$repair_ok" != "200" ]]; then
  echo "repaired user sign-in code failed (HTTP ${repair_ok})" >&2
  exit 1
fi
OTP_EMAIL="hosted-repair@example.test" OTP_SINCE="$since" python3 - <<'PY'
import json, os, re, time, urllib.request
from datetime import datetime, timedelta, timezone
email = os.environ["OTP_EMAIL"].lower()
since = datetime.fromtimestamp(int(os.environ["OTP_SINCE"]), tz=timezone.utc) - timedelta(seconds=2)
deadline = time.time() + 20
while time.time() < deadline:
    with urllib.request.urlopen("http://127.0.0.1:54324/api/v1/messages?limit=50") as res:
        payload = json.load(res)
    for message in payload.get("messages") or []:
        tos = message.get("To") or []
        if not any((item.get("Address") or item.get("address") or "").lower() == email for item in tos):
            continue
        created_raw = message.get("Created") or ""
        if created_raw:
            created = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
            if created < since:
                continue
        with urllib.request.urlopen(
            "http://127.0.0.1:54324/api/v1/message/" + str(message["ID"])
        ) as res:
            full = json.load(res)
        text = "%s %s" % (full.get("HTML") or "", full.get("Text") or "")
        if "/invite#" in text:
            continue
        if re.search(r"\b\d{6}\b", text):
            print("sign-in code arrived")
            raise SystemExit(0)
    time.sleep(0.4)
raise SystemExit("sign-in code did not arrive")
PY

run_bootstrap "Hosted Fresh" "hosted-fresh@example.test"
if [[ "$(local_psql -At -c "select case when email_confirmed_at is null then 'no' else 'yes' end from auth.users where email = 'hosted-fresh@example.test'")" != "yes" ]]; then
  echo "bootstrap created an unconfirmed user" >&2
  exit 1
fi
since="$(date +%s)"
fresh_ok="$(otp_code "hosted-fresh@example.test" /tmp/otp-fresh.json)"
if [[ "$fresh_ok" != "200" ]]; then
  echo "new bootstrap user sign-in code failed (HTTP ${fresh_ok})" >&2
  exit 1
fi
OTP_EMAIL="hosted-fresh@example.test" OTP_SINCE="$since" python3 - <<'PY'
import json, os, re, time, urllib.request
from datetime import datetime, timedelta, timezone
email = os.environ["OTP_EMAIL"].lower()
since = datetime.fromtimestamp(int(os.environ["OTP_SINCE"]), tz=timezone.utc) - timedelta(seconds=2)
deadline = time.time() + 20
while time.time() < deadline:
    with urllib.request.urlopen("http://127.0.0.1:54324/api/v1/messages?limit=50") as res:
        payload = json.load(res)
    for message in payload.get("messages") or []:
        tos = message.get("To") or []
        if not any((item.get("Address") or item.get("address") or "").lower() == email for item in tos):
            continue
        created_raw = message.get("Created") or ""
        if created_raw:
            created = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
            if created < since:
                continue
        with urllib.request.urlopen(
            "http://127.0.0.1:54324/api/v1/message/" + str(message["ID"])
        ) as res:
            full = json.load(res)
        text = "%s %s" % (full.get("HTML") or "", full.get("Text") or "")
        if "/invite#" in text:
            continue
        if re.search(r"\b\d{6}\b", text):
            print("new user sign-in code arrived")
            raise SystemExit(0)
    time.sleep(0.4)
raise SystemExit("new user sign-in code did not arrive")
PY

unset OTP_SECRET OTP_KEY
echo "hosted auth bootstrap otp passed"
