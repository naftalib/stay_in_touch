#!/usr/bin/env bash
# The ops suite must not read, write, or delete the operator's production env file.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"
# shellcheck source=scripts/deploy/hosted-refusal.sh
source "$(dirname "$0")/hosted-refusal.sh"

fail() {
  echo "hosted refusal test failed: $1" >&2
  exit 1
}

prod="$REPO_ROOT/.env.production.local"
backup=""
if [[ -e "$prod" || -L "$prod" ]]; then
  backup="$(mktemp)"
  cp -a "$prod" "$backup"
fi

cleanup() {
  if [[ -n "$backup" ]]; then
    rm -f "$prod"
    cp -a "$backup" "$prod"
    rm -f "$backup"
  else
    rm -f "$prod"
  fi
}
trap cleanup EXIT

sentinel='operator-production-secret-do-not-lose'
umask 077
printf '%s\n' "$sentinel" >"$prod"
before="$(cksum "$prod")"

set +e
run_hosted_actions_refusal "$REPO_ROOT" /tmp/boot-hosted-test.out
status=$?
set -e

after="$(cksum "$prod")"
if [[ "$before" != "$after" ]]; then
  fail "the production env file changed"
fi
if ! grep -qx "$sentinel" "$prod"; then
  fail "the production env sentinel was lost"
fi
if [[ "$status" -eq 0 ]]; then
  fail "hosted Actions bootstrap was allowed"
fi
if ! grep -q 'hosted project' /tmp/boot-hosted-test.out; then
  cat /tmp/boot-hosted-test.out >&2
  fail "expected the hosted-project error"
fi
if grep -q 'example-app-password' /tmp/boot-hosted-test.out; then
  fail "the fake app password was printed"
fi

suite="$REPO_ROOT/scripts/deploy/ops-suite.sh"
if grep -n 'env.production.local' "$suite" >/dev/null; then
  fail "ops-suite.sh still names .env.production.local"
fi

suite_trap="$(awk -F"'" '/^trap / { print $2; exit }' "$suite")"
expected="rm -f \"\$env_file\""
if [[ "$suite_trap" != "$expected" ]]; then
  fail "ops suite trap is not limited to the scratch test env"
fi
scratch="$(mktemp)"
printf 'suite-scratch\n' >"$scratch"
# An early failure runs this trap before the hosted check. It may delete the
# scratch test env only. The trap text is the suite's, so its quotes must stay.
# shellcheck disable=SC2086
env_file="$scratch" bash -c "set -euo pipefail; $suite_trap"
if [[ -e "$scratch" ]]; then
  fail "the suite trap left its scratch test env in place"
fi
if ! grep -qx "$sentinel" "$prod"; then
  fail "the suite trap removed the production env file"
fi

rm -f /tmp/boot-hosted-test.out
echo "hosted refusal test passed"
