import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const smokeScript = resolve(root, "scripts/production-smoke.sh");

function executable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function makeSmokeFixture({
  alwaysUnavailable = false,
  hangOpenSsl = false,
  hangPm2 = false,
} = {}) {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-production-smoke-test-"));
  const bin = resolve(sandbox, "bin");
  const eventLog = resolve(sandbox, "events.log");
  const curlCount = resolve(sandbox, "curl-count");
  mkdirSync(bin, { recursive: true });

  executable(resolve(bin, "curl"), `#!/usr/bin/env bash
printf 'curl' >> '${eventLog}'
for arg in "$@"; do printf ' %q' "$arg" >> '${eventLog}'; done
printf '\\n' >> '${eventLog}'
for arg in "$@"; do
  if [[ "$arg" == "-k" || "$arg" == "--insecure" ]]; then exit 97; fi
done
body=''
url="\${!#}"
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  if [[ "\${args[$i]}" == '-o' ]]; then body="\${args[$((i + 1))]}"; fi
done
code=200
if [[ "$url" == 'http://127.0.0.1:5173/api/health' ]]; then
  count=0
  [[ -f '${curlCount}' ]] && count="$(<'${curlCount}')"
  count=$((count + 1))
  printf '%s\\n' "$count" > '${curlCount}'
  if [[ '${alwaysUnavailable ? "yes" : "no"}' == 'yes' || "$count" -le 2 ]]; then code=503; fi
fi
if [[ -n "$body" && "$body" != '/dev/null' ]]; then
  case "$url" in
    */api/health) printf '%s' '{"ok":true}' > "$body" ;;
    */war-risk-zone.geojson) printf '%s' '{"type":"FeatureCollection","features":[]}' > "$body" ;;
    *) printf '%s' '<html><title>Vessel Tracker</title></html>' > "$body" ;;
  esac
fi
printf '%s' "$code"
`);

  executable(resolve(bin, "node"), `#!/usr/bin/env bash
printf 'node %s\\n' "$*" >> '${eventLog}'
if [[ -n "\${SMOKE_WS_URL:-}" ]]; then
  printf 'SMOKE_WS_URL=%s\\n' "$SMOKE_WS_URL" >> '${eventLog}'
fi
cat >/dev/null || true
exit 0
`);

  executable(resolve(bin, "pm2"), `#!/usr/bin/env bash
printf 'pm2 %s\\n' "$*" >> '${eventLog}'
if [[ "$1" == 'jlist' ]]; then
  if [[ '${hangPm2 ? "yes" : "no"}' == 'yes' ]]; then exec /bin/sleep 30; fi
  printf '%s\\n' '[{"name":"vessel-backend","pm2_env":{"status":"online","pm_exec_path":"/release/backend/wait-for-db.js"}},{"name":"vessel-frontend","pm2_env":{"status":"online","pm_exec_path":"/release/frontend/server.mjs"}}]'
fi
`);

  executable(resolve(bin, "openssl"), `#!/usr/bin/env bash
printf 'openssl %s\\n' "$*" >> '${eventLog}'
if [[ "$1" == 's_client' ]]; then
  if [[ '${hangOpenSsl ? "yes" : "no"}' == 'yes' ]]; then exec /bin/sleep 30; fi
  joined=" $* "
  [[ "$joined" == *' -verify_return_error '* ]] || exit 71
  [[ "$joined" == *' -verify_hostname reviewed.example '* ]] || exit 72
  [[ "$joined" == *' -servername reviewed.example '* ]] || exit 73
  [[ "$joined" == *' -connect reviewed.example:4443 '* ]] || exit 74
  printf '%s\\n' 'fake-certificate-stream'
else
  cat >/dev/null
  printf '%s\\n' 'subject=CN=reviewed.example' 'issuer=CN=test-ca' 'notBefore=test' 'notAfter=test'
fi
`);

  return { sandbox, bin, eventLog };
}

function runSmoke(fixture, overrides = {}) {
  return spawnSync("bash", [smokeScript], {
    encoding: "utf8",
    timeout: 3_000,
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      BASE_URL: "http://127.0.0.1:5173",
      EXTERNAL_URL: "https://reviewed.example:4443",
      EXPECTED_RELEASE_PATH: "/release",
      PM2_HOME: resolve(fixture.sandbox, "pm2"),
      SMOKE_READINESS_TIMEOUT_SECONDS: "3",
      SMOKE_READINESS_POLL_SECONDS: "0.01",
      SMOKE_REQUEST_TIMEOUT_SECONDS: "1",
      ...overrides,
    },
  });
}

test("production smoke retries bounded local readiness, validates TLS, and derives the reviewed host", () => {
  const fixture = makeSmokeFixture();
  try {
    const result = runSmoke(fixture);
    assert.equal(result.status, 0, result.stderr);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.doesNotMatch(events, /(?:^| )-k(?: |$)|--insecure/m);
    assert.ok((events.match(/127\.0\.0\.1:5173\/api\/health/g) || []).length >= 3, events);
    assert.match(events, /openssl s_client .*?-verify_return_error/);
    assert.match(events, /-verify_hostname reviewed\.example/);
    assert.match(events, /-connect reviewed\.example:4443/);
    assert.match(events, /pm2 jlist/);
    assert.match(events, /SMOKE_WS_URL=ws:\/\/127\.0\.0\.1:5173\/ws$/m);
    const script = readFileSync(smokeScript, "utf8");
    assert.doesNotMatch(script, /token=invalid-production-smoke/);
    assert.match(script, /new WebSocket\(process\.env\.SMOKE_WS_URL, \['vessel-auth', 'invalid-production-smoke'\]\)/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("production smoke derives a secure WebSocket URL from an HTTPS BASE_URL", () => {
  const fixture = makeSmokeFixture();
  try {
    const result = runSmoke(fixture, { BASE_URL: "https://local.reviewed:7443" });
    assert.equal(result.status, 0, result.stderr);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(events, /SMOKE_WS_URL=wss:\/\/local\.reviewed:7443\/ws$/m);
    assert.doesNotMatch(events, /ws:\/\/127\.0\.0\.1:5173\/ws/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("production smoke rejects malformed, non-http, and credentialed BASE_URL values", () => {
  for (const baseUrl of [
    "not-a-url",
    "ftp://local.reviewed:5173",
    "https://user:password@local.reviewed:5173",
  ]) {
    const fixture = makeSmokeFixture();
    try {
      const result = runSmoke(fixture, { BASE_URL: baseUrl });
      assert.notEqual(result.status, 0, `accepted invalid BASE_URL: ${baseUrl}`);
      assert.match(result.stderr, /BASE_URL must be a reviewed http\(s\) URL without credentials/);
    } finally {
      rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  }
});

test("backend test command serializes timing-sensitive production smoke gates", () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, "backend/package.json"), "utf8"));
  assert.match(packageJson.scripts.test, /--test-concurrency=1/);
});

test("production smoke terminates a hanging OpenSSL network gate within the gate deadline", () => {
  const fixture = makeSmokeFixture({ hangOpenSsl: true });
  try {
    const startedAt = Date.now();
    const result = runSmoke(fixture, { SMOKE_GATE_TIMEOUT_SECONDS: "1" });
    const elapsedMs = Date.now() - startedAt;
    assert.notEqual(result.status, null, "outer test harness had to terminate the smoke script");
    assert.notEqual(result.status, 0);
    assert.ok(elapsedMs < 2_500, `OpenSSL gate exceeded strict bound: ${elapsedMs}ms`);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(events, /openssl s_client/);
    assert.doesNotMatch(events, /pm2 jlist/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("production smoke terminates a hanging PM2 gate within the gate deadline", () => {
  const fixture = makeSmokeFixture({ hangPm2: true });
  try {
    const startedAt = Date.now();
    const result = runSmoke(fixture, { SMOKE_GATE_TIMEOUT_SECONDS: "1" });
    const elapsedMs = Date.now() - startedAt;
    assert.notEqual(result.status, null, "outer test harness had to terminate the smoke script");
    assert.notEqual(result.status, 0);
    assert.ok(elapsedMs < 2_500, `PM2 gate exceeded strict bound: ${elapsedMs}ms`);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(events, /pm2 jlist/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("production smoke rejects non-positive or non-integer gate timeouts", () => {
  for (const gateTimeout of ["0", "1.5", "invalid"]) {
    const fixture = makeSmokeFixture();
    try {
      const result = runSmoke(fixture, { SMOKE_GATE_TIMEOUT_SECONDS: gateTimeout });
      assert.notEqual(result.status, 0, `accepted invalid gate timeout: ${gateTimeout}`);
      assert.match(result.stderr, /SMOKE_GATE_TIMEOUT_SECONDS must be a positive integer/);
    } finally {
      rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  }
});

test("production smoke local readiness has a strict overall deadline before external gates", () => {
  const fixture = makeSmokeFixture({ alwaysUnavailable: true });
  try {
    const startedAt = Date.now();
    const result = runSmoke(fixture, {
      SMOKE_READINESS_TIMEOUT_SECONDS: "1",
      SMOKE_READINESS_POLL_SECONDS: "0.05",
    });
    const elapsedMs = Date.now() - startedAt;
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /local readiness timed out/i);
    assert.ok(elapsedMs < 2_500, `readiness exceeded strict bound: ${elapsedMs}ms`);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.doesNotMatch(events, /openssl|pm2 jlist/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("production smoke contract forbids insecure curl and requires fail-closed TLS and PM2 tools", () => {
  const source = readFileSync(smokeScript, "utf8");
  assert.doesNotMatch(source, /curl[^\n]* (?:-k|--insecure)(?: |$)/);
  assert.match(source, /SMOKE_READINESS_TIMEOUT_SECONDS/);
  assert.match(source, /local readiness timed out/);
  assert.match(source, /-verify_return_error/);
  assert.match(source, /-verify_hostname/);
  assert.match(source, /for command in [^\n]*\btimeout\b[^\n]*; do/);
  assert.match(source, /for command in[\s\S]*openssl[\s\S]*pm2/);
});
