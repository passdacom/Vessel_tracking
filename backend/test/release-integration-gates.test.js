import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const canonicalBaselineSql = readFileSync(
  resolve(root, "backend/prisma/migrations/20260715100000_baseline/migration.sql"),
  "utf8",
);

function executable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function runPrebuiltDeployScenario({
  baselineSql = canonicalBaselineSql,
  migrationSql = "CREATE INDEX IF NOT EXISTS idx_ok ON \"Vessel\"(\"active\");\n",
  domainTableCount = 2,
  migrationsTableExists = true,
  baselineSucceeded = true,
} = {}) {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-prebuilt-deploy-test-"));
  const repo = resolve(sandbox, "repo");
  const bin = resolve(sandbox, "bin");
  const releaseRoot = resolve(sandbox, "release-root");
  const releases = resolve(releaseRoot, "releases");
  const candidateSha = "dddddddddddddddddddddddddddddddddddddddd";
  const currentRelease = resolve(releases, "current-release");
  const targetRelease = resolve(releases, candidateSha);
  const eventLog = resolve(sandbox, "events.log");
  const backendEnvFile = resolve(sandbox, "vessel-tracking.env");
  writeFileSync(eventLog, "");
  writeFileSync(backendEnvFile, "VESSEL_DB_WAIT_MAX_MS=12345\n", { mode: 0o600 });
  mkdirSync(resolve(repo, ".git"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const release of [currentRelease, targetRelease]) {
    mkdirSync(resolve(release, "backend", "prisma", "migrations"), { recursive: true });
    mkdirSync(resolve(release, "backend", "node_modules", "@prisma", "client"), { recursive: true });
    mkdirSync(resolve(release, "frontend", "dist"), { recursive: true });
    mkdirSync(resolve(release, "scripts"), { recursive: true });
    writeFileSync(resolve(release, "backend", "prisma", "schema.prisma"), "datasource db {}\n");
    writeFileSync(resolve(release, "frontend", "dist", "index.html"), "ready\n");
    writeFileSync(resolve(release, "frontend", "server.mjs"), "// ready\n");
    writeFileSync(resolve(release, "ecosystem.config.cjs"), "module.exports = { apps: [] };\n");
  }
  writeFileSync(resolve(currentRelease, ".vessel-release-sha"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  writeFileSync(resolve(currentRelease, ".vessel-readiness"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  writeFileSync(resolve(targetRelease, ".vessel-release-sha"), `${candidateSha}\n`);
  writeFileSync(resolve(targetRelease, ".vessel-readiness"), `${candidateSha}\n`);
  const baselineDir = resolve(targetRelease, "backend", "prisma", "migrations", "20260715100000_baseline");
  const postBaselineDir = resolve(targetRelease, "backend", "prisma", "migrations", "20260715110000_test");
  if (baselineSql !== null) {
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(resolve(baselineDir, "migration.sql"), baselineSql);
  }
  mkdirSync(postBaselineDir, { recursive: true });
  writeFileSync(resolve(postBaselineDir, "migration.sql"), migrationSql);
  executable(resolve(currentRelease, "scripts/production-smoke.sh"), "#!/usr/bin/env bash\nexit 0\n");
  executable(resolve(targetRelease, "scripts/production-smoke.sh"), `#!/usr/bin/env bash
printf 'smoke EXTERNAL_URL=%s BASE_URL=%s UNRELATED_SENTINEL=%s\\n' "\${EXTERNAL_URL:-unset}" "\${BASE_URL:-unset}" "\${UNRELATED_SENTINEL:-unset}" >> '${eventLog}'
`);
  symlinkSync(currentRelease, resolve(releaseRoot, "current"));

  executable(resolve(bin, "git"), `#!/usr/bin/env bash
case "$*" in
  *"status --porcelain"*) exit 0 ;;
  *"rev-parse"*) printf '${candidateSha}\\n' ;;
  *) exit 0 ;;
esac
`);
  executable(resolve(bin, "npm"), "#!/usr/bin/env bash\nexit 0\n");
  executable(resolve(bin, "curl"), "#!/usr/bin/env bash\nexit 0\n");
  executable(resolve(bin, "npx"), `#!/usr/bin/env bash
printf 'npx %s\\n' "$*" >> '${eventLog}'
exit 0
`);
  executable(resolve(bin, "docker"), `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> '${eventLog}'
case "$*" in
  *information_schema.tables*) printf '${domainTableCount}\\t${migrationsTableExists ? "t" : "f"}\\n' ;;
  *migration_name*) printf '${baselineSucceeded ? "t" : "f"}\\n' ;;
  *pg_dump*) printf 'backup' ;;
  *pg_restore*) printf 'manifest' ;;
esac
`);
  executable(resolve(bin, "sha256sum"), "#!/usr/bin/env bash\nprintf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  %s\\n' \"$1\"\n");
  executable(resolve(bin, "pm2"), `#!/usr/bin/env bash
if [[ "$1" == 'jlist' ]]; then
  if [[ "$*" != *'--silent'* ]]; then printf '\\033[32m[PM2] Spawning daemon\\033[0m\\n'; fi
  printf '[]\\n'
  exit 0
fi
printf 'pm2 %s\\n' "$*" >> '${eventLog}'
`);

  const result = spawnSync("bash", [resolve(root, "scripts/release.sh"), "deploy", candidateSha], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VESSEL_ROOT: repo,
      VESSEL_RELEASE_ROOT: releaseRoot,
      VESSEL_BACKUP_DIR: resolve(releaseRoot, "backups"),
      PM2_BIN: "pm2",
      APPROVE_RELEASE: "YES",
      DATABASE_URL: "postgresql://placeholder.invalid/db",
      VESSEL_BACKEND_ENV_FILE: backendEnvFile,
      EXTERNAL_URL: "https://attacker.invalid",
      UNRELATED_SENTINEL: "must-not-reach-smoke",
    },
  });
  return { sandbox, releaseRoot, currentRelease, eventLog, result };
}

test("prebuilt deploy rejects a non-index migration before baseline probe, backup, or migrate", () => {
  const fixture = runPrebuiltDeployScenario({ migrationSql: "ALTER TABLE \"Vessel\" ADD COLUMN \"risk\" TEXT;\n" });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(fixture.result.stderr, /index-only|expand\/contract/i);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.doesNotMatch(events, /information_schema\.tables|pg_dump|migrate deploy/);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("prebuilt deploy rejects a missing or mutated baseline before database probe, backup, or migrate", () => {
  for (const baselineSql of [null, "MUTATED_BASELINE_SQL_MUST_NOT_BE_PRINTED\n"]) {
    const fixture = runPrebuiltDeployScenario({ baselineSql });
    try {
      assert.notEqual(fixture.result.status, 0);
      assert.match(fixture.result.stderr, /immutable reviewed baseline integrity/i);
      assert.doesNotMatch(
        `${fixture.result.stdout}${fixture.result.stderr}`,
        /MUTATED_BASELINE_SQL_MUST_NOT_BE_PRINTED/,
      );
      const events = readFileSync(fixture.eventLog, "utf8");
      assert.doesNotMatch(events, /information_schema\.tables|pg_dump|migrate deploy/);
      assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    } finally {
      rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  }
});

test("prebuilt deploy baseline preflight fails closed before backup and never auto-resolves", () => {
  const fixture = runPrebuiltDeployScenario({ migrationsTableExists: false, baselineSucceeded: false });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(fixture.result.stderr, /Human Gate/);
    assert.match(fixture.result.stderr, /prisma migrate resolve --applied 20260715100000_baseline/);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(events, /information_schema\.tables/);
    assert.doesNotMatch(events, /pg_dump|migrate deploy|migrate resolve/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("prebuilt deploy runs gates before backup and uses canonical sanitized smoke", () => {
  const fixture = runPrebuiltDeployScenario();
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.ok(events.indexOf("information_schema.tables") < events.indexOf("npx prisma migrate diff"), events);
    assert.ok(events.indexOf("information_schema.tables") < events.indexOf("pg_dump"), events);
    assert.ok(events.indexOf("pg_dump") < events.indexOf("migrate deploy"), events);
    assert.match(events, /smoke EXTERNAL_URL=https:\/\/vessel\.ttacom\.net BASE_URL=http:\/\/127\.0\.0\.1:5173 UNRELATED_SENTINEL=unset/);
    assert.doesNotMatch(events, /attacker\.invalid|must-not-reach-smoke/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});
