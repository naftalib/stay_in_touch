#!/usr/bin/env bash
# One production build must contain only that environment's public URL and key.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

build_with() {
  local url="$1"
  local key="$2"
  local vapid="$3"
  env -u VITE_SUPABASE_URL -u VITE_SUPABASE_PUBLISHABLE_KEY -u VITE_VAPID_PUBLIC_KEY \
    VITE_SUPABASE_URL="$url" \
    VITE_SUPABASE_PUBLISHABLE_KEY="$key" \
    VITE_VAPID_PUBLIC_KEY="$vapid" \
    pnpm --filter web build
}

build_with "https://fake-test-project.supabase.co" "sb_publishable_fake_test_only" "fake-vapid-test"
if ! grep -R -q "fake-test-project.supabase.co" web/dist; then
  echo "test URL was not baked into the bundle" >&2
  exit 1
fi
if grep -R -q "fake-prod-project.supabase.co" web/dist; then
  echo "production URL leaked into the test bundle" >&2
  exit 1
fi

build_with "https://fake-prod-project.supabase.co" "sb_publishable_fake_prod_only" "fake-vapid-prod"
if ! grep -R -q "fake-prod-project.supabase.co" web/dist; then
  echo "production URL was not baked into the bundle" >&2
  exit 1
fi
if grep -R -q "fake-test-project.supabase.co" web/dist; then
  echo "test URL leaked into the production bundle" >&2
  exit 1
fi
if [[ ! -f web/dist/_headers ]]; then
  echo "_headers was not copied into dist" >&2
  exit 1
fi
echo "build env check passed"
