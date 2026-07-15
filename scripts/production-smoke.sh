#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BASE_URL="${BASE_URL:-http://127.0.0.1:5173}"
EXTERNAL_URL="${EXTERNAL_URL:-https://vessel.ttacom.net}"
VESSEL_DB_WAIT_MAX_MS="${VESSEL_DB_WAIT_MAX_MS:-120000}"
[[ "$VESSEL_DB_WAIT_MAX_MS" =~ ^[1-9][0-9]*$ ]] || {
  echo '[FAIL] VESSEL_DB_WAIT_MAX_MS must be a positive integer' >&2
  exit 64
}
DEFAULT_READINESS_TIMEOUT_SECONDS=$(((VESSEL_DB_WAIT_MAX_MS + 999) / 1000 + 15))
SMOKE_READINESS_TIMEOUT_SECONDS="${SMOKE_READINESS_TIMEOUT_SECONDS:-$DEFAULT_READINESS_TIMEOUT_SECONDS}"
SMOKE_READINESS_POLL_SECONDS="${SMOKE_READINESS_POLL_SECONDS:-2}"
SMOKE_REQUEST_TIMEOUT_SECONDS="${SMOKE_REQUEST_TIMEOUT_SECONDS:-5}"
SMOKE_GATE_TIMEOUT_SECONDS="${SMOKE_GATE_TIMEOUT_SECONDS:-12}"
[[ "$SMOKE_GATE_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || {
  echo '[FAIL] SMOKE_GATE_TIMEOUT_SECONDS must be a positive integer' >&2
  exit 64
}
TMP_BODY="$(mktemp -t vessel-smoke-body.XXXXXX)"
cleanup() { rm -f "$TMP_BODY"; }
trap cleanup EXIT

for command in curl python3 node openssl pm2 timeout; do
  command -v "$command" >/dev/null || {
    echo "[FAIL] required smoke command is unavailable: $command" >&2
    exit 69
  }
done

python3 - \
  "$SMOKE_READINESS_TIMEOUT_SECONDS" \
  "$SMOKE_READINESS_POLL_SECONDS" \
  "$SMOKE_REQUEST_TIMEOUT_SECONDS" <<'PY'
import math
import sys

timeout, poll, request_timeout = map(float, sys.argv[1:])
if not all(math.isfinite(value) and value > 0 for value in (timeout, poll, request_timeout)):
    raise SystemExit("smoke timeout and polling values must be positive finite numbers")
if not timeout.is_integer() or not request_timeout.is_integer():
    raise SystemExit("smoke readiness and request timeouts must be whole seconds")
PY

read -r BASE_URL SMOKE_WS_URL < <(python3 - "$BASE_URL" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

try:
    raw_url = sys.argv[1]
    if any(character.isspace() for character in raw_url):
        raise ValueError
    parsed = urlsplit(raw_url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError
    parsed.port
except ValueError:
    raise SystemExit("BASE_URL must be a reviewed http(s) URL without credentials")

base_path = parsed.path.rstrip("/")
base_url = urlunsplit((parsed.scheme, parsed.netloc, base_path, "", ""))
ws_scheme = "wss" if parsed.scheme == "https" else "ws"
ws_url = urlunsplit((ws_scheme, parsed.netloc, f"{base_path}/ws", "token=invalid-production-smoke", ""))
print(base_url, ws_url)
PY
)

read -r EXTERNAL_HOST EXTERNAL_PORT < <(python3 - "$EXTERNAL_URL" <<'PY'
import sys
from urllib.parse import urlsplit

parsed = urlsplit(sys.argv[1])
if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
    raise SystemExit("EXTERNAL_URL must be a reviewed https URL without credentials")
print(parsed.hostname, parsed.port or 443)
PY
)

curl_probe() {
  local url="$1"
  local deadline="$2"
  local remaining request_timeout code
  remaining=$((deadline - SECONDS))
  ((remaining > 0)) || return 1
  request_timeout="$SMOKE_REQUEST_TIMEOUT_SECONDS"
  if ((request_timeout > remaining)); then request_timeout="$remaining"; fi
  code=$(curl -sS -m "$request_timeout" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null) || return 1
  [[ "$code" == "200" ]]
}

bounded_sleep() {
  local remaining="$1" sleep_for
  sleep_for="$(python3 - "$SMOKE_READINESS_POLL_SECONDS" "$remaining" <<'PY'
import sys
print(min(float(sys.argv[1]), float(sys.argv[2])))
PY
)"
  sleep "$sleep_for"
}

wait_for_local_readiness() {
  local deadline attempt remaining
  SECONDS=0
  deadline=$((SMOKE_READINESS_TIMEOUT_SECONDS))
  attempt=0
  while ((SECONDS < deadline)); do
    attempt=$((attempt + 1))
    if curl_probe "$BASE_URL/" "$deadline" && curl_probe "$BASE_URL/api/health" "$deadline"; then
      echo "[OK] local readiness reached after $attempt attempt(s)"
      return 0
    fi
    remaining=$((deadline - SECONDS))
    ((remaining > 0)) || break
    bounded_sleep "$remaining"
  done
  echo "[FAIL] local readiness timed out after ${SMOKE_READINESS_TIMEOUT_SECONDS}s" >&2
  return 1
}

curl_check() {
  local label="$1"
  local url="$2"
  local expect_code="$3"
  local code
  code=$(curl -sS -m "$SMOKE_REQUEST_TIMEOUT_SECONDS" -o "$TMP_BODY" -w '%{http_code}' "$url")
  if [[ "$code" != "$expect_code" ]]; then
    echo "[FAIL] $label expected HTTP $expect_code but got $code: $url" >&2
    head -c 500 "$TMP_BODY" >&2 || true
    echo >&2
    return 1
  fi
  echo "[OK] $label HTTP $code $url"
}

wait_for_local_readiness

curl_check 'local root' "$BASE_URL/" 200
if ! grep -q 'Vessel Tracker' "$TMP_BODY"; then
  echo '[FAIL] local root did not contain Vessel Tracker title' >&2
  exit 1
fi
if grep -q '/@react-refresh' "$TMP_BODY"; then
  echo '[FAIL] local root appears to be Vite dev server output' >&2
  exit 1
fi

echo '[OK] local root is production index'

curl_check 'local api health' "$BASE_URL/api/health" 200
python3 - "$TMP_BODY" <<'PY'
import json, sys
body = open(sys.argv[1], 'rb').read().decode('utf-8')
assert json.loads(body) == {'ok': True}, body
print('[OK] local api health body {"ok":true}')
PY

curl_check 'local SPA fallback' "$BASE_URL/nonexistent-client-route" 200
if ! grep -q 'Vessel Tracker' "$TMP_BODY"; then
  echo '[FAIL] SPA fallback did not return index.html' >&2
  exit 1
fi

echo '[OK] local SPA fallback returns index.html'

curl_check 'local war risk geojson' "$BASE_URL/war-risk-zone.geojson" 200
python3 - "$TMP_BODY" <<'PY'
import json, sys
body = json.load(open(sys.argv[1], encoding='utf-8'))
assert body.get('type') in {'FeatureCollection', 'Feature'}, body.get('type')
print(f"[OK] local war-risk-zone.geojson type={body.get('type')}")
PY

SMOKE_WS_URL="$SMOKE_WS_URL" node - <<'NODE'
const ws = new WebSocket(process.env.SMOKE_WS_URL);
const timer = setTimeout(() => { console.error('[FAIL] websocket invalid-token close timeout'); process.exit(1); }, 5000);
ws.addEventListener('close', (ev) => {
  clearTimeout(timer);
  if (ev.code !== 1008) {
    console.error(`[FAIL] websocket expected close code 1008, got ${ev.code} ${ev.reason}`);
    process.exit(1);
  }
  console.log(`[OK] websocket proxy reached backend and rejected invalid token code=${ev.code} reason=${ev.reason}`);
});
NODE

curl_check 'external https root' "$EXTERNAL_URL/" 200
if ! grep -q 'Vessel Tracker' "$TMP_BODY"; then
  echo '[FAIL] external root did not contain Vessel Tracker title' >&2
  exit 1
fi

echo '[OK] external root serves Vessel Tracker'

timeout "$SMOKE_GATE_TIMEOUT_SECONDS" openssl s_client \
  -verify_return_error \
  -verify_hostname "$EXTERNAL_HOST" \
  -servername "$EXTERNAL_HOST" \
  -connect "$EXTERNAL_HOST:$EXTERNAL_PORT" \
  </dev/null \
  | openssl x509 -noout -subject -issuer -dates \
  | sed 's/^/[OK] cert /'

PM2_HOME="${PM2_HOME:-/var/lib/vessel-tracking/pm2}"
PM2_HOME="$PM2_HOME" timeout "$SMOKE_GATE_TIMEOUT_SECONDS" pm2 jlist | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const apps = JSON.parse(s);
  const front = apps.find(a => a.name === "vessel-frontend");
  const back = apps.find(a => a.name === "vessel-backend");
  if (!front || !back) throw new Error("vessel PM2 apps missing");
  if (front.pm2_env.status !== "online") throw new Error("vessel-frontend not online");
  if (back.pm2_env.status !== "online") throw new Error("vessel-backend not online");
  const expectedRelease = process.env.EXPECTED_RELEASE_PATH;
  if (expectedRelease) {
    for (const app of [front, back]) {
      const execPath = String(app.pm2_env.pm_exec_path || "");
      if (!execPath.startsWith(`${expectedRelease}/`)) {
        throw new Error(`${app.name} is not running from current release: ${execPath}`);
      }
    }
  }
  if (!String(front.pm2_env.pm_exec_path || "").endsWith("/frontend/server.mjs")) {
    throw new Error(`frontend not running production server: ${front.pm2_env.pm_exec_path}`);
  }
  console.log(`[OK] PM2 backend=${back.pm2_env.status} frontend=${front.pm2_env.status} exec=${front.pm2_env.pm_exec_path}`);
});'

echo '[OK] vessel production smoke complete'
