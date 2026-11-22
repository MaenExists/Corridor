#!/usr/bin/env bash
set -euo pipefail
export CORRIDOR_API_PORT="${CORRIDOR_API_PORT:-8787}" CORRIDOR_WEB_PORT="${CORRIDOR_WEB_PORT:-5173}"
ports=("$CORRIDOR_API_PORT")
if [[ "${1:-}" != "--api-only" ]]; then ports+=("$CORRIDOR_WEB_PORT"); fi
.venv/bin/python - "${ports[@]}" <<'PY'
import socket
import sys

for value in sys.argv[1:]:
    if not value.isascii() or not value.isdecimal() or not 1024 <= int(value) <= 65535:
        raise SystemExit("Corridor port numbers must be between 1024 and 65535.")
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", int(value)))
        except OSError:
            raise SystemExit(f"Corridor needs local port {value}. Stop the existing server on it before running this demo.")
PY
export WRANGLER_SEND_METRICS=false
export WRANGLER_HIDE_BANNER=true
unset CLOUDFLARE_ENV
export CORRIDOR_REVIEW_KEY="${CORRIDOR_REVIEW_KEY:-$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(12))')}"
wrangler=("./node_modules/.bin/wrangler" "--config" "worker/wrangler.jsonc")
state_dir="${CORRIDOR_STATE_DIR:-worker/.wrangler/demo-state}"
"${wrangler[@]}" d1 migrations apply corridor-demo --local --persist-to "$state_dir" </dev/null
"${wrangler[@]}" dev --local --port "$CORRIDOR_API_PORT" --inspector-port 0 --persist-to "$state_dir" \
  --var "DEMO_REVIEW_KEY:$CORRIDOR_REVIEW_KEY" --var "DEMO_WEB_ORIGIN:http://127.0.0.1:$CORRIDOR_WEB_PORT" &
worker=$!
cleanup() {
  kill "$worker" 2>/dev/null || true
  if [[ -n "${web:-}" ]]; then kill "$web" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 0' INT TERM
for ((i=0;i<80;i++)); do
  if curl --silent --fail "http://127.0.0.1:$CORRIDOR_API_PORT/api/health" > /dev/null; then break; fi
  kill -0 "$worker"
  sleep 0.25
done
curl --silent --fail "http://127.0.0.1:$CORRIDOR_API_PORT/api/health" > /dev/null
if [[ "${1:-}" == "--api-only" ]]; then
  wait "$worker"
else
  .venv/bin/python -m ml.collector.feed
  echo "Corridor: http://127.0.0.1:$CORRIDOR_WEB_PORT (SYNTHETIC DATA)"
  echo "Local analyst review key (for fixture inbox and leads): $CORRIDOR_REVIEW_KEY"
  ./node_modules/.bin/vite --config web/vite.config.ts &
  web=$!
  wait -n "$web" "$worker"
fi
