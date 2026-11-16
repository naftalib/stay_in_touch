#!/usr/bin/env bash
# Serve dist with wrangler dev (no Cloudflare account) and check headers.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

if [[ ! -f web/dist/index.html || ! -f web/dist/_headers ]]; then
  echo "run check-build-env.sh or pnpm --filter web build first" >&2
  exit 1
fi

port="${WRANGLER_PORT:-8787}"
log="$(mktemp)"
(
  cd "$root/web"
  npx wrangler dev --port "$port" --ip 127.0.0.1 --local-protocol http
) >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; rm -f "$log"' EXIT

ready=0
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:${port}/"; then
    ready=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "wrangler dev exited early" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "wrangler dev did not open port ${port}" >&2
  cat "$log" >&2
  exit 1
fi

deno run --allow-net "$root/scripts/post-deploy-check.ts" "http://127.0.0.1:${port}"
echo "header check passed"
