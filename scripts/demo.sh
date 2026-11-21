#!/usr/bin/env bash
set -euo pipefail
export WRANGLER_SEND_METRICS=false
export CLOUDFLARE_ENV=local
export CORRIDOR_REVIEW_KEY="${CORRIDOR_REVIEW_KEY:-$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(12))')}"
wrangler=("./node_modules/.bin/wrangler" "--config" "worker/wrangler.jsonc")
"${wrangler[@]}" d1 migrations apply corridor-demo --local
"${wrangler[@]}" dev --local --var "DEMO_REVIEW_KEY:$CORRIDOR_REVIEW_KEY" &
worker=$!
cleanup() {
  kill "$worker" 2>/dev/null || true
  if [[ -n "${web:-}" ]]; then kill "$web" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for ((i=0;i<80;i++)); do
  if curl --silent --fail http://127.0.0.1:8787/api/health > /dev/null; then break; fi
  kill -0 "$worker"
  sleep 0.25
done
curl --silent --fail http://127.0.0.1:8787/api/health > /dev/null
if [[ "${1:-}" == "--api-only" ]]; then
  wait "$worker"
else
  echo "Corridor: http://127.0.0.1:5173 (SYNTHETIC DATA)"
  echo "Local analyst review key (for fixture inbox and leads): $CORRIDOR_REVIEW_KEY"
  ./node_modules/.bin/vite --config web/vite.config.ts &
  web=$!
  wait -n "$web" "$worker"
fi
