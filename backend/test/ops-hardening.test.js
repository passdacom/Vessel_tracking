import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import {
  buildAllowedEnv,
  isEntrypoint,
  loadBackendEnv,
  startBackendInProcess,
  waitForDb,
} from "../wait-for-db.js";
import {
  createFrontendServer,
  parseRequestPath,
  selectBackendTransport,
} from "../../frontend/server.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:c|m)?js$/.test(entry.name) ? [path] : [];
  });
}

test("Prisma schema and additive migration cover hot operational queries", () => {
  const schema = read("backend/prisma/schema.prisma");
  assert.match(schema, /@@index\(\[vesselId, suspicious, timestamp\(sort: Desc\)\]\)/);
  assert.match(schema, /@@index\(\[vesselId, zoneName, createdAt\(sort: Desc\)\]\)/);
  assert.match(schema, /model SharedView[\s\S]*@@index\(\[expiresAt\]\)/);
  assert.match(schema, /model Vessel[\s\S]*@@index\(\[active\]\)/);

  const migration = read("backend/prisma/migrations/20260715110000_sprint0_hardening_indexes/migration.sql");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS "Position_vesselId_suspicious_timestamp_idx"/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS "ZoneEvent_vesselId_zoneName_createdAt_idx"/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS "SharedView_expiresAt_idx"/);
});

test("PM2 and host examples define bounded resources and log rotation", () => {
  const ecosystem = read("ecosystem.config.cjs");
  assert.match(ecosystem, /const ROOT = __dirname/);
  assert.match(ecosystem, /cwd:\s*join\(ROOT, "backend"\)/);
  assert.match(ecosystem, /cwd:\s*join\(ROOT, "frontend"\)/);
  assert.match(ecosystem, /max_memory_restart:\s*"512M"/);
  assert.match(ecosystem, /kill_timeout:\s*10000/);
  assert.match(ecosystem, /autorestart:\s*true/);
  assert.match(ecosystem, /const LOG_DIR = process\.env\.VESSEL_LOG_DIR/);
  assert.match(ecosystem, /out_file:\s*join\(LOG_DIR, "backend-out\.log"\)/);
  assert.match(ecosystem, /out_file:\s*join\(LOG_DIR, "frontend-out\.log"\)/);

  assert.equal(existsSync(resolve(root, "ops/logrotate/vessel-tracking")), true);
  const logrotate = read("ops/logrotate/vessel-tracking");
  assert.match(logrotate, /^\/var\/log\/vessel-tracking\/\*\.log/m);
  assert.match(logrotate, /^\/var\/log\/vessel-tracking\/app\/\*\.log/m);
  assert.match(logrotate, /rotate 14/);
  assert.match(logrotate, /maxsize 50M/);
  assert.match(logrotate, /compress/);

  const systemd = read("ops/systemd/pm2-root.service.example");
  assert.match(systemd, /Restart=on-failure/);
  assert.match(systemd, /LimitNOFILE=65536/);
  assert.doesNotMatch(systemd, /^EnvironmentFile=/m);
  assert.match(systemd, /Environment=VESSEL_BACKEND_ENV_FILE=\/etc\/vessel-tracking\/vessel-tracking.env/);
  assert.match(systemd, /PM2_HOME=\/var\/lib\/vessel-tracking\/pm2/);
  assert.match(systemd, /VESSEL_LOG_DIR=\/var\/log\/vessel-tracking/);
  assert.match(systemd, /LogsDirectory=vessel-tracking/);
  assert.match(systemd, /^UMask=0077$/m);
  assert.match(systemd, /^ExecReload=.* reload vessel-backend --update-env$/m);
  assert.match(systemd, /^ExecReload=.* reload vessel-frontend --update-env$/m);
  assert.doesNotMatch(systemd, /^ExecReload=.*vessel-backend vessel-frontend/m);
  assert.match(systemd, /ExecStop=.*delete vessel-backend vessel-frontend/);
  assert.doesNotMatch(systemd, /reload all|pm2 kill|\/root\/\.pm2/);

  const loggerSource = read("backend/src/utils/logger.js");
  assert.match(loggerSource, /process\.env\.VESSEL_LOG_DIR/);
  const runbook = read("docs/production-runbook.md");
  assert.doesNotMatch(runbook, /\/root\/\.openclaw\/workspace\/Vessel_tracking\/(?:backend|frontend|logs)\/.*\.log/);
});

test("compose requires an injected database password and binds PostgreSQL to loopback", () => {
  const compose = read("docker-compose.yml");
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/);
  assert.match(compose, /127\.0\.0\.1:5432:5432/);
  assert.doesNotMatch(compose, /vessel_pass/);

  const example = read("backend/.env.example");
  assert.match(example, /POSTGRES_PASSWORD=/);
  assert.match(example, /DATALASTIC_API_KEY=/);
  assert.doesNotMatch(example, /password1|adminpassword|vessel_pass/);
});

test("backend JavaScript contains no hardcoded UUID-shaped Datalastic credential", () => {
  const credentialLiteral = /(?:apiKey|DATALASTIC_API_KEY)\s*=\s*["'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}["']/i;
  const backendRoot = resolve(root, "backend");
  const offenders = sourceFiles(backendRoot)
    .filter((path) => credentialLiteral.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(backendRoot.length + 1));

  assert.deepEqual(offenders, [], `hardcoded Datalastic credential in: ${offenders.join(", ")}`);
});

test("database launcher fails closed on a Prisma readiness query and uses an env allowlist", () => {
  const launcher = read("backend/wait-for-db.js");
  assert.match(launcher, /PrismaClient/);
  assert.match(launcher, /SELECT 1/);
  assert.match(launcher, /BACKEND_ENV_ALLOWLIST/);
  assert.match(launcher, /importBackend/);
  assert.doesNotMatch(launcher, /child_process|spawnBackend|from "net"|prisma generate|runPrismaGenerate|서버를 강제 시작/);
});

test("database launcher recognizes its real PM2 fork entrypoint", () => {
  const launcherPath = resolve(root, "backend/wait-for-db.js");
  assert.equal(isEntrypoint({ argv: ["node", launcherPath], env: {} }), true);
  assert.equal(isEntrypoint({
    argv: ["node", "/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js"],
    env: { pm_exec_path: launcherPath },
  }), true);
  assert.equal(isEntrypoint({
    argv: ["node", "/usr/lib/node_modules/pm2/lib/ProcessContainerFork.js"],
    env: {},
  }), false);
});

test("production backend cannot repopulate sanitized env from an implicit dotenv import", () => {
  const index = read("backend/src/index.js");
  const packageJson = JSON.parse(read("backend/package.json"));
  assert.doesNotMatch(index, /dotenv(?:\/config)?/);
  assert.equal(packageJson.scripts.start, "node --import dotenv/config src/index.js");
  assert.equal(packageJson.scripts.dev, "node --watch --import dotenv/config src/index.js");
});

test("frontend server exports a bounded protocol-aware server factory", () => {
  const server = read("frontend/server.mjs");
  assert.match(server, /import https from 'node:https'/);
  assert.match(server, /export function createFrontendServer/);
  assert.match(server, /backendUrl\.protocol === 'https:' \? https : http/);
  assert.match(server, /upstreamTimeoutMs/);
  assert.match(server, /headersTimeout/);
  assert.match(server, /requestTimeout/);
  assert.match(server, /SIGTERM/);
  assert.match(server, /SIGINT/);
});

test("database launcher readiness is query-based, fail-closed, and disconnects", async () => {
  let now = 0;
  let attempts = 0;
  let disconnects = 0;
  class EventuallyReadyPrisma {
    async $queryRaw() {
      attempts += 1;
      if (attempts < 2) throw new Error("not ready");
      return [{ ok: 1 }];
    }
    async $disconnect() { disconnects += 1; }
  }
  const result = await waitForDb({
    PrismaClientClass: EventuallyReadyPrisma,
    maxWaitMs: 10,
    retryIntervalMs: 1,
    now: () => now,
    sleep: async (delay) => { now += delay; },
  });
  assert.deepEqual(result, { attempts: 2 });
  assert.equal(disconnects, 1);

  class NeverReadyPrisma {
    async $queryRaw() { throw new Error("not ready"); }
    async $disconnect() { disconnects += 1; }
  }
  now = 0;
  await assert.rejects(
    waitForDb({
      PrismaClientClass: NeverReadyPrisma,
      maxWaitMs: 2,
      retryIntervalMs: 1,
      now: () => now,
      sleep: async (delay) => { now += delay; },
    }),
    /readiness timed out/,
  );
  assert.equal(disconnects, 2);
});

test("database launcher replaces inherited env with the strict backend allowlist", async () => {
  assert.deepEqual(
    buildAllowedEnv({
      DATABASE_URL: "db",
      HOST: "127.0.0.1",
      PORT: "3001",
      VESSEL_LOG_DIR: "/tmp/vessel-logs",
      SHUTDOWN_TIMEOUT_MS: "10000",
      UNRELATED_SECRET: "drop-me",
    }),
    {
      HOST: "127.0.0.1",
      PORT: "3001",
      DATABASE_URL: "db",
      SHUTDOWN_TIMEOUT_MS: "10000",
      VESSEL_LOG_DIR: "/tmp/vessel-logs",
    },
  );
  const processEnv = {
    PATH: "/usr/bin",
    PM2_HOME: "/var/lib/vessel-tracking/pm2",
    UNRELATED_SECRET: "drop-me",
  };
  let importedEnv;
  const marker = { started: true };
  const returned = await startBackendInProcess({
    env: { DATABASE_URL: "db", UNRELATED_SECRET: "drop-me" },
    processEnv,
    importBackend: async () => {
      importedEnv = { ...processEnv };
      return marker;
    },
  });
  assert.equal(returned, marker);
  assert.deepEqual(importedEnv, { DATABASE_URL: "db" });
  assert.deepEqual(processEnv, importedEnv);
  assert.equal(processEnv.UNRELATED_SECRET, undefined);
  assert.equal(processEnv.PM2_HOME, undefined);
});

test("database launcher securely loads the reviewed backend env file without retaining unrelated secrets", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-backend-env-test-"));
  try {
    const envFile = resolve(sandbox, "vessel-tracking.env");
    writeFileSync(envFile, [
      "DATABASE_URL=postgresql://reviewed.invalid/vessel",
      "POSTGRES_PASSWORD=database-only-not-backend-runtime",
      "DATALASTIC_API_KEY=reviewed-api-key",
      "ACCOUNTS=reviewed-account",
      "UNRELATED_SENTINEL=must-not-pass",
      "VESSEL_LOG_DIR=/tmp/file-must-not-override-systemd",
      "HOST=0.0.0.0",
      "SHUTDOWN_TIMEOUT_MS=10000",
      "",
    ].join("\n"), { mode: 0o600 });

    const runtimeEnv = loadBackendEnv({
      env: {
        NODE_ENV: "production",
        VESSEL_BACKEND_ENV_FILE: envFile,
        VESSEL_LOG_DIR: "/var/log/vessel-tracking",
        HOST: "127.0.0.1",
        UNRELATED_PROCESS_SECRET: "must-not-pass",
      },
      cwd: sandbox,
    });

    assert.equal(runtimeEnv.DATABASE_URL, "postgresql://reviewed.invalid/vessel");
    assert.equal(runtimeEnv.DATALASTIC_API_KEY, "reviewed-api-key");
    assert.equal(runtimeEnv.ACCOUNTS, "reviewed-account");
    assert.equal(runtimeEnv.VESSEL_LOG_DIR, "/var/log/vessel-tracking");
    assert.equal(runtimeEnv.POSTGRES_PASSWORD, undefined);
    assert.equal(runtimeEnv.UNRELATED_SENTINEL, undefined);
    assert.equal(runtimeEnv.UNRELATED_PROCESS_SECRET, undefined);

    chmodSync(envFile, 0o644);
    assert.throws(
      () => loadBackendEnv({ env: { VESSEL_BACKEND_ENV_FILE: envFile }, cwd: sandbox }),
      /permissions.*0600|must not be accessible/i,
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("production ecosystem binds both apps to loopback and excludes frontend secrets", async () => {
  const ecosystemModule = await import(`../../ecosystem.config.cjs?env-isolation=${Date.now()}`);
  const backend = ecosystemModule.default.apps.find((app) => app.name === "vessel-backend");
  const frontend = ecosystemModule.default.apps.find((app) => app.name === "vessel-frontend");
  assert.ok(backend);
  assert.ok(frontend);
  assert.equal(backend.env.HOST, "127.0.0.1");
  assert.equal(frontend.env.HOST, "127.0.0.1");
  for (const secret of [
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "DATALASTIC_API_KEY",
    "ACCOUNTS",
    "UNRELATED_SENTINEL",
  ]) {
    assert.equal(Object.hasOwn(frontend.env, secret), false, `${secret} leaked into frontend env`);
  }

  const runbook = read("docs/production-runbook.md");
  assert.match(runbook, /vessel-backend[^\n]*127\.0\.0\.1:3001/);
  assert.match(runbook, /vessel-frontend[^\n]*127\.0\.0\.1:5173/);
  assert.match(runbook, /Nginx[^\n]*public ingress/i);
});

test("frontend helpers reject malformed paths and select HTTP or HTTPS", () => {
  assert.equal(parseRequestPath("/%E0%A4%A"), null);
  assert.equal(parseRequestPath("/safe%20path"), "/safe path");
  const transports = { http: { name: "http" }, https: { name: "https" } };
  assert.equal(selectBackendTransport(new URL("http://127.0.0.1"), transports), transports.http);
  assert.equal(selectBackendTransport(new URL("https://example.invalid"), transports), transports.https);
  assert.throws(() => selectBackendTransport(new URL("ftp://example.invalid"), transports), /http/);
});

test("frontend server returns 400 for malformed URL encoding and configures timeouts", async () => {
  const server = createFrontendServer({
    backendUrl: "http://127.0.0.1:9",
    headersTimeoutMs: 1_234,
    requestTimeoutMs: 2_345,
    keepAliveTimeoutMs: 456,
  });
  assert.equal(server.headersTimeout, 1_234);
  assert.equal(server.requestTimeout, 2_345);
  assert.equal(server.keepAliveTimeout, 456);
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  const response = await new Promise((resolveResponse, rejectResponse) => {
    const request = http.request({ host: "127.0.0.1", port, path: "/%E0%A4%A" }, resolveResponse);
    request.on("error", rejectResponse);
    request.end();
  });
  response.resume();
  await new Promise((resolveEnd) => response.once("end", resolveEnd));
  assert.equal(response.statusCode, 400);
  await new Promise((resolveClose) => server.close(resolveClose));
});

function listen(server) {
  return new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
}

function closeServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function openUpgrade(port, path = "/ws") {
  const socket = net.connect(port, "127.0.0.1");
  socket.write(
    `GET ${path} HTTP/1.1\r\n` +
    `Host: 127.0.0.1:${port}\r\n` +
    "Connection: Upgrade\r\n" +
    "Upgrade: websocket\r\n\r\n",
  );
  return socket;
}

test("WS proxy keeps an established socket past connect timeout and bounds a stalled handshake", async () => {
  const upstreamSockets = new Set();
  const upstream = net.createServer((socket) => {
    upstreamSockets.add(socket);
    socket.once("close", () => upstreamSockets.delete(socket));
    socket.once("data", (request) => {
      if (request.toString().includes("/ws/stalled")) return;
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
        "Connection: Upgrade\r\n" +
        "Upgrade: websocket\r\n\r\n",
      );
    });
  });
  await listen(upstream);
  const frontend = createFrontendServer({
    backendUrl: `http://127.0.0.1:${upstream.address().port}`,
    upstreamTimeoutMs: 25,
    wsConnectTimeoutMs: 25,
    wsIdleTimeoutMs: 150,
  });
  await listen(frontend);
  const established = openUpgrade(frontend.address().port);
  const stalled = openUpgrade(frontend.address().port, "/ws/stalled");

  try {
    await new Promise((resolveWait) => setTimeout(resolveWait, 70));
    assert.equal(established.destroyed, false, "established WS was destroyed at the short connect timeout");
    assert.equal(stalled.destroyed, true, "stalled WS handshake exceeded the connect timeout");
  } finally {
    established.destroy();
    stalled.destroy();
    frontend.destroyOpenConnections();
    for (const socket of upstreamSockets) socket.destroy();
    await closeServer(frontend);
    await closeServer(upstream);
  }
});

test("release workflow is fail-fast and requires migration, reload, smoke, and rollback mode", () => {
  const release = read("scripts/release.sh") + read("scripts/release-atomic.sh");
  assert.match(release, /set -Eeuo pipefail/);
  assert.match(release, /pg_dump/);
  assert.match(release, /prisma migrate deploy/);
  assert.match(release, /ACTION="\$\{1:-dry-run\}"/);
  assert.match(release, /APPROVE_RELEASE/);
  assert.match(release, /APPROVE_ROLLBACK/);
  assert.match(release, /sha256sum/);
  assert.match(release, /migration-plan\.sql/);
  assert.match(release, /CURRENT_LINK/);
  assert.match(release, /PREVIOUS_LINK/);
  assert.match(release, /mv -Tf/);
  assert.match(release, /EXPECTED_RELEASE_PATH/);
  assert.match(release, /Refusing rollback to the active release/);
  assert.match(release, /restore_after_failure/);
  assert.match(release, /candidate_sha=/);
  assert.match(release, /backup_sha256=/);
  assert.match(release, /smoke_results=/);
  assert.match(release, /^umask 077$/m);
  assert.match(release, /VESSEL_PM2_MAINTENANCE_OVERRIDE/);
  assert.match(release, /APPROVE_PM2_MAINTENANCE/);
  assert.ok(release.indexOf("prisma migrate diff") < release.indexOf("pg_dump"));

  const nginx = read("ops/nginx/vessel-tracking.conf.example");
  assert.match(nginx, /proxy_set_header Upgrade \$http_upgrade/);
  assert.match(nginx, /proxy_read_timeout 65s/);
  assert.match(nginx, /client_max_body_size 1m/);
  assert.match(nginx, /^\s*set_real_ip_from 127\.0\.0\.1;$/m);
  assert.match(nginx, /^\s*set_real_ip_from ::1;$/m);
  assert.match(nginx, /^\s*real_ip_header X-Forwarded-For;$/m);
  assert.match(nginx, /^\s*real_ip_recursive on;$/m);
  assert.equal((nginx.match(/proxy_set_header X-Real-IP \$remote_addr;/g) || []).length, 3);
  assert.equal((nginx.match(/proxy_set_header X-Forwarded-For \$remote_addr;/g) || []).length, 3);
  assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for|set_real_ip_from 0\.0\.0\.0\/0/);
  assert.match(nginx, /non-loopback[\s\S]*explicit[\s\S]*CIDR/i);

  const runbook = read("docs/production-runbook.md");
  assert.match(runbook, /prisma migrate deploy/);
  assert.match(runbook, /Post-restart verification/);
  assert.match(runbook, /rollback/);
  assert.match(runbook, /docker compose --env-file \/etc\/vessel-tracking\/vessel-tracking.env/);
  assert.match(runbook, /full 40-hex|40-character full SHA/i);
  assert.match(runbook, /VESSEL_PM2_MAINTENANCE_OVERRIDE/);
  assert.match(runbook, /APPROVE_PM2_MAINTENANCE/);
  assert.match(runbook, /0700/);
  assert.match(runbook, /0600/);
  assert.match(runbook, /frontend.*DATABASE_URL|DATABASE_URL.*frontend/i);
  assert.match(runbook, /certificate authority|hostname|expiry/i);
  const composeCommands = runbook.split("\n").filter((line) => line.startsWith("docker compose "));
  assert.ok(composeCommands.length > 0);
  assert.equal(
    composeCommands.every((line) => line.startsWith(
      "docker compose --env-file /etc/vessel-tracking/vessel-tracking.env -f docker-compose.yml ",
    )),
    true,
  );
});

test("generated Graphify, worktrees, local settings, and runtime rotations are narrowly ignored", () => {
  const gitignore = read(".gitignore");
  assert.match(gitignore, /^graphify-out\/$/m);
  assert.match(gitignore, /^\.worktrees\/$/m);
  assert.match(gitignore, /^\.claude\/settings\.local\.json$/m);
  assert.match(gitignore, /^logs\/\*$/m);
  assert.match(gitignore, /^!logs\/\.gitkeep$/m);
  assert.match(gitignore, /^\*\.log\.\[0-9\]\*$/m);
  assert.doesNotMatch(gitignore, /^(?:docs|scripts|tests?|src)\/$/m);
});

test("release defaults to a side-effect-free dry run", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-release-test-"));
  try {
    const repo = resolve(sandbox, "repo");
    const bin = resolve(sandbox, "bin");
    const releaseRoot = resolve(sandbox, "release-root");
    const marker = resolve(sandbox, "side-effect-called");
    mkdirSync(resolve(repo, ".git"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    const gitStub = `#!/usr/bin/env bash\ncase "$*" in\n  *"status --porcelain"*) exit 0 ;;\n  *"rev-parse"*) printf '0123456789abcdef0123456789abcdef01234567\\n' ;;\n  *"cat-file -e"*) exit 0 ;;\n  *) exit 0 ;;\nesac\n`;
    writeFileSync(resolve(bin, "git"), gitStub);
    chmodSync(resolve(bin, "git"), 0o755);
    for (const command of ["npm", "npx", "docker", "pm2", "curl", "sha256sum"]) {
      const file = resolve(bin, command);
      writeFileSync(file, `#!/usr/bin/env bash\ntouch '${marker}'\nexit 99\n`);
      chmodSync(file, 0o755);
    }
    const result = spawnSync("bash", [resolve(root, "scripts/release.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        VESSEL_ROOT: repo,
        VESSEL_RELEASE_ROOT: releaseRoot,
        PM2_BIN: "pm2",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN/);
    assert.match(result.stdout, /candidate_sha=0123456789abcdef/);
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(releaseRoot), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
