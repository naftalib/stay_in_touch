#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

target="${1:?usage: web-deploy.sh <test|production>}"
cd "$REPO_ROOT"
require_names \
  VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_VAPID_PUBLIC_KEY \
  CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

pnpm --filter web build
(
  cd "$REPO_ROOT/web"
  npx wrangler deploy --env "$target"
)
echo "web deploy finished"
