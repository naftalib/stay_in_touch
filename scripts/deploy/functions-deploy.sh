#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$REPO_ROOT"
require_names SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF
cmd=(supabase functions deploy --yes)
refuse_seed "${cmd[@]}"
"${cmd[@]}"
echo "functions deploy finished"
