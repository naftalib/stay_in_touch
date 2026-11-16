#!/usr/bin/env bash
# Link the CLI at SUPABASE_PROJECT_REF. The password stays in the environment.
set -euo pipefail
# shellcheck source=scripts/deploy/lib.sh
source "$(dirname "$0")/lib.sh"

require_names SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD
cd "$REPO_ROOT"
refuse_seed supabase link --project-ref "$SUPABASE_PROJECT_REF" --yes
supabase link --project-ref "$SUPABASE_PROJECT_REF" --yes
echo "linked"
