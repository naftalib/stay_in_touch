#!/usr/bin/env bash
# Prove bootstrap refuses a hosted project when Actions is set.
# The fake env file is created in a temp directory. Callers must not point
# this at the operator's .env.production.local.

# Callers that need the refusal status must disable errexit around the call.
# A non-zero return is the hosted-project refusal.
run_hosted_actions_refusal() {
  local root="$1"
  local out_file="$2"
  local hosted_dir
  local status=0
  hosted_dir="$(mktemp -d)"
  if (
    trap 'rm -rf "$hosted_dir"' EXIT
    umask 077
    cat >"${hosted_dir}/.env.production.local" <<'EOF'
SUPABASE_URL=https://example.supabase.co
SUPABASE_SECRET_KEY=example-only
APP_URL=https://stay-in-touch.example.workers.dev
EMAIL_TRANSPORT=gmail
GMAIL_SMTP_USER=sender@example.test
GMAIL_SMTP_PASS=example-app-password
EMAIL_FROM=Stay In Touch <sender@example.test>
EOF
    cd "$hosted_dir" || exit 1
    # cwd is the temp dir, so bootstrap reads the fake file there.
    GITHUB_ACTIONS=true deno run --node-modules-dir=none --allow-net --allow-env --allow-read --allow-run \
      "$root/scripts/bootstrap-family.ts" \
      --env production --family "Nope" --email "nobody@example.test" --label "Mom"
  ) >"$out_file" 2>&1
  then
    status=0
  else
    status=$?
  fi
  rm -rf "$hosted_dir"
  return "$status"
}
