import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");

function executable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

test("failed rollback smoke restores current and never uses global PM2 operations", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-rollback-test-"));
  try {
    const repo = resolve(sandbox, "repo");
    const bin = resolve(sandbox, "bin");
    const releaseRoot = resolve(sandbox, "release-root");
    const releases = resolve(releaseRoot, "releases");
    const oldRelease = resolve(releases, "old-release");
    const failedRelease = resolve(releases, "failed-release");
    const eventLog = resolve(sandbox, "events.log");
    mkdirSync(resolve(repo, ".git"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    for (const release of [oldRelease, failedRelease]) {
      mkdirSync(resolve(release, "backend", "prisma"), { recursive: true });
      mkdirSync(resolve(release, "backend", "node_modules", "@prisma", "client"), { recursive: true });
      mkdirSync(resolve(release, "frontend", "dist"), { recursive: true });
      mkdirSync(resolve(release, "scripts"), { recursive: true });
      writeFileSync(resolve(release, "backend", "prisma", "schema.prisma"), "datasource db {}\n");
      writeFileSync(resolve(release, "frontend", "dist", "index.html"), "ready\n");
      writeFileSync(resolve(release, "frontend", "server.mjs"), "// ready\n");
      writeFileSync(resolve(release, "ecosystem.config.cjs"), "module.exports = { apps: [] };\n");
    }
    writeFileSync(resolve(oldRelease, ".vessel-release-sha"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
    writeFileSync(resolve(failedRelease, ".vessel-release-sha"), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
    writeFileSync(resolve(oldRelease, ".vessel-readiness"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
    writeFileSync(resolve(failedRelease, ".vessel-readiness"), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
    executable(resolve(oldRelease, "scripts/production-smoke.sh"), `#!/usr/bin/env bash\nprintf 'smoke old\\n' >> '${eventLog}'\nexit 0\n`);
    executable(resolve(failedRelease, "scripts/production-smoke.sh"), `#!/usr/bin/env bash\nprintf 'smoke failed\\n' >> '${eventLog}'\nexit 23\n`);
    symlinkSync(oldRelease, resolve(releaseRoot, "current"));
    symlinkSync(failedRelease, resolve(releaseRoot, "previous"));

    executable(resolve(bin, "git"), "#!/usr/bin/env bash\ncase \"$*\" in *\"status --porcelain\"*) exit 0;; *\"rev-parse\"*) printf 'cccccccccccccccccccccccccccccccccccccccc\\n';; *) exit 0;; esac\n");
    executable(resolve(bin, "npm"), "#!/usr/bin/env bash\nexit 0\n");
    executable(resolve(bin, "npx"), "#!/usr/bin/env bash\nexit 0\n");
    executable(resolve(bin, "docker"), "#!/usr/bin/env bash\nif [[ \"$*\" == *pg_dump* ]]; then printf 'backup'; else printf 'manifest'; fi\n");
    executable(resolve(bin, "sha256sum"), "#!/usr/bin/env bash\nprintf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  %s\\n' \"$1\"\n");
    executable(resolve(bin, "pm2"), `#!/usr/bin/env bash
if [[ "$1" == "jlist" ]]; then
  printf '[{"name":"vessel-backend"},{"name":"vessel-frontend"}]\\n'
  exit 0
fi
printf 'pm2 %s\\n' "$*" >> '${eventLog}'
exit 0
`);
    executable(resolve(bin, "curl"), "#!/usr/bin/env bash\nexit 0\n");

    const result = spawnSync("bash", [resolve(root, "scripts/release.sh"), "rollback"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        VESSEL_ROOT: repo,
        VESSEL_RELEASE_ROOT: releaseRoot,
        VESSEL_BACKUP_DIR: resolve(releaseRoot, "backups"),
        PM2_BIN: "pm2",
        APPROVE_ROLLBACK: "YES",
        APPROVE_PM2_REPLACEMENT: "YES",
        DATABASE_URL: "postgresql://placeholder.invalid/db",
      },
    });

    assert.notEqual(result.status, 0);
    assert.equal(realpathSync(resolve(releaseRoot, "current")), oldRelease);
    assert.equal(realpathSync(resolve(releaseRoot, "previous")), failedRelease);
    const events = readFileSync(eventLog, "utf8").trim().split("\n");
    const failedSmoke = events.indexOf("smoke failed");
    const restoredSmoke = events.indexOf("smoke old");
    const saves = events.flatMap((event, index) => event === "pm2 save" ? [index] : []);
    assert.ok(failedSmoke > -1, events.join("\n"));
    assert.ok(restoredSmoke > failedSmoke, events.join("\n"));
    assert.deepEqual(saves, [restoredSmoke + 1], events.join("\n"));
    assert.match(events.join("\n"), /pm2 delete vessel-backend vessel-frontend/);
    assert.match(events.join("\n"), /pm2 start .*current\/ecosystem\.config\.cjs --update-env/);
    assert.doesNotMatch(events.join("\n"), /startOrReload|reload all|delete all|pm2 kill/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

function runRollbackScenario({
  dirty = false,
  headFails = false,
  failMvAt = 0,
  failChmodAt = 0,
  signalAfterMv = 0,
  signalOnPm2Activation = false,
  pm2Inventory = [],
  pm2StartFailure = "none",
  pm2DeleteFailure = "none",
  pm2Home,
  extraEnv = {},
} = {}) {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-rollback-links-test-"));
  const repo = resolve(sandbox, "repo");
  const bin = resolve(sandbox, "bin");
  const releaseRoot = resolve(sandbox, "release-root");
  const releases = resolve(releaseRoot, "releases");
  const currentRelease = resolve(releases, "current-release");
  const previousRelease = resolve(releases, "previous-release");
  const eventLog = resolve(sandbox, "events.log");
  const mvCount = resolve(sandbox, "mv.count");
  const chmodCount = resolve(sandbox, "chmod.count");
  const signalMarker = resolve(sandbox, "signal.sent");
  const pm2StartCount = resolve(sandbox, "pm2-start.count");
  const pm2DeleteCount = resolve(sandbox, "pm2-delete.count");
  mkdirSync(resolve(repo, ".git"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  for (const release of [currentRelease, previousRelease]) {
    mkdirSync(resolve(release, "backend", "prisma"), { recursive: true });
    mkdirSync(resolve(release, "backend", "node_modules", "@prisma", "client"), { recursive: true });
    mkdirSync(resolve(release, "frontend", "dist"), { recursive: true });
    mkdirSync(resolve(release, "scripts"), { recursive: true });
    writeFileSync(resolve(release, "backend", "prisma", "schema.prisma"), "datasource db {}\n");
    writeFileSync(resolve(release, "frontend", "dist", "index.html"), "ready\n");
    writeFileSync(resolve(release, "frontend", "server.mjs"), "// ready\n");
    writeFileSync(resolve(release, "ecosystem.config.cjs"), "module.exports = { apps: [] };\n");
  }
  writeFileSync(resolve(currentRelease, ".vessel-release-sha"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  writeFileSync(resolve(previousRelease, ".vessel-release-sha"), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
  writeFileSync(resolve(currentRelease, ".vessel-readiness"), "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
  writeFileSync(resolve(previousRelease, ".vessel-readiness"), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n");
  executable(resolve(currentRelease, "scripts/production-smoke.sh"), `#!/usr/bin/env bash
printf 'smoke current\\n' >> '${eventLog}'
printf 'smoke environment EXTERNAL_URL=%s BASE_URL=%s UNRELATED_SENTINEL=%s\\n' "\${EXTERNAL_URL:-unset}" "\${BASE_URL:-unset}" "\${UNRELATED_SENTINEL:-unset}" >> '${eventLog}'
`);
  executable(resolve(previousRelease, "scripts/production-smoke.sh"), `#!/usr/bin/env bash
printf 'smoke previous\\n' >> '${eventLog}'
printf 'smoke environment EXTERNAL_URL=%s BASE_URL=%s UNRELATED_SENTINEL=%s\\n' "\${EXTERNAL_URL:-unset}" "\${BASE_URL:-unset}" "\${UNRELATED_SENTINEL:-unset}" >> '${eventLog}'
`);
  symlinkSync(currentRelease, resolve(releaseRoot, "current"));
  symlinkSync(previousRelease, resolve(releaseRoot, "previous"));

  executable(resolve(bin, "git"), `#!/usr/bin/env bash
case "$*" in
  *"status --porcelain"*) ${dirty ? "printf ' M dirty\\n'" : ":"}; exit 0 ;;
  *"rev-parse"*) ${headFails ? "exit 55" : "printf 'cccccccccccccccccccccccccccccccccccccccc\\n'"} ;;
  *) exit 0 ;;
esac
`);
  for (const command of ["npm", "npx", "curl"]) {
    executable(resolve(bin, command), "#!/usr/bin/env bash\nexit 0\n");
  }
  executable(resolve(bin, "docker"), "#!/usr/bin/env bash\nif [[ \"$*\" == *pg_dump* ]]; then printf 'backup'; else printf 'manifest'; fi\n");
  executable(resolve(bin, "sha256sum"), "#!/usr/bin/env bash\nprintf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  %s\\n' \"$1\"\n");
  executable(resolve(bin, "pm2"), `#!/usr/bin/env bash
if [[ "$1" == "jlist" ]]; then
  printf '%s\\n' '${JSON.stringify(pm2Inventory)}'
  exit 0
fi
if env | grep -Eq '^(DATABASE_URL|POSTGRES_PASSWORD|DATALASTIC_API_KEY|ACCOUNTS|UNRELATED_SENTINEL)='; then
  printf 'pm2 secret env present\\n' >> '${eventLog}'
fi
if [[ -n "\${VESSEL_BACKEND_ENV_FILE:-}" ]]; then
  printf 'pm2 backend env path set\\n' >> '${eventLog}'
fi
printf 'pm2 %s\\n' "$*" >> '${eventLog}'
if [[ "$1" == 'start' ]]; then
  count=0
  [[ -f '${pm2StartCount}' ]] && count="$(<'${pm2StartCount}')"
  count=$((count + 1))
  printf '%s\\n' "$count" > '${pm2StartCount}'
  if [[ '${pm2StartFailure}' == 'all' || ( '${pm2StartFailure}' == 'first' && "$count" == '1' ) ]]; then
    exit 91
  fi
fi
if [[ "$1" == 'delete' ]]; then
  count=0
  [[ -f '${pm2DeleteCount}' ]] && count="$(<'${pm2DeleteCount}')"
  count=$((count + 1))
  printf '%s\\n' "$count" > '${pm2DeleteCount}'
  if [[ '${pm2DeleteFailure}' == 'all' || ( '${pm2DeleteFailure}' == 'first' && "$count" == '1' ) ]]; then
    exit 92
  fi
fi
if [[ '${signalOnPm2Activation ? "yes" : "no"}' == 'yes' && ( "$1" == 'delete' || "$1" == 'start' ) && ! -f '${signalMarker}' ]]; then
  touch '${signalMarker}'
  kill -TERM "$PPID"
fi
`);
  if (failMvAt > 0 || signalAfterMv > 0) {
    executable(resolve(bin, "mv"), `#!/usr/bin/env bash
count=0
[[ -f '${mvCount}' ]] && count="$(<'${mvCount}')"
count=$((count + 1))
printf '%s\\n' "$count" > '${mvCount}'
if [[ "$count" == '${failMvAt}' ]]; then exit 42; fi
/bin/mv "$@"
if [[ "$count" == '${signalAfterMv}' && ! -f '${signalMarker}' ]]; then
  touch '${signalMarker}'
  kill -TERM "$PPID"
fi
`);
  }
  if (failChmodAt > 0) {
    executable(resolve(bin, "chmod"), `#!/usr/bin/env bash
count=0
[[ -f '${chmodCount}' ]] && count="$(<'${chmodCount}')"
count=$((count + 1))
printf '%s\\n' "$count" > '${chmodCount}'
if [[ "$count" == '${failChmodAt}' ]]; then exit 42; fi
exec /usr/bin/chmod "$@"
`);
  }

  const result = spawnSync("bash", [resolve(root, "scripts/release.sh"), "rollback"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VESSEL_ROOT: repo,
      VESSEL_RELEASE_ROOT: releaseRoot,
      VESSEL_BACKUP_DIR: resolve(releaseRoot, "backups"),
      PM2_BIN: "pm2",
      VESSEL_BACKEND_ENV_FILE: resolve(sandbox, "reviewed-backend.env"),
      APPROVE_ROLLBACK: "YES",
      APPROVE_PM2_REPLACEMENT: "YES",
      DATABASE_URL: "postgresql://placeholder.invalid/db",
      ...(pm2Home ? { PM2_HOME: pm2Home } : {}),
      ...extraEnv,
    },
  });
  return { sandbox, releaseRoot, currentRelease, previousRelease, eventLog, result };
}

test("failure during the second symlink mutation restores both release links", () => {
  const fixture = runRollbackScenario({ failMvAt: 2 });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "previous")), fixture.previousRelease);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("active PM2 replacement requires separate maintenance approval before side effects", () => {
  const fixture = runRollbackScenario({
    extraEnv: { APPROVE_PM2_REPLACEMENT: "" },
  });
  try {
    assert.equal(fixture.result.status, 65, fixture.result.stderr);
    assert.match(fixture.result.stderr, /APPROVE_PM2_REPLACEMENT=YES/);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "previous")), fixture.previousRelease);
    assert.equal(existsSync(fixture.eventLog), false);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("an activation start failure restores the previous release and preserves the original error", () => {
  const fixture = runRollbackScenario({ pm2StartFailure: "first" });
  try {
    assert.equal(fixture.result.status, 91, fixture.result.stderr);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.equal((events.match(/^pm2 start /gm) || []).length, 2, events);
    assert.match(events, /smoke current/);
    assert.doesNotMatch(fixture.result.stderr, /operator intervention required/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("a partial delete command failure re-enters named replacement and restores service", () => {
  const fixture = runRollbackScenario({
    pm2Inventory: [{ name: "vessel-backend" }, { name: "vessel-frontend" }],
    pm2DeleteFailure: "first",
  });
  try {
    assert.equal(fixture.result.status, 92, fixture.result.stderr);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.equal((events.match(/^pm2 delete vessel-backend vessel-frontend$/gm) || []).length, 2, events);
    assert.match(events, /smoke current/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("a recovery start failure exits distinctly instead of claiming restoration", () => {
  const fixture = runRollbackScenario({ pm2StartFailure: "all" });
  try {
    assert.equal(fixture.result.status, 70, fixture.result.stderr);
    assert.match(fixture.result.stderr, /automatic recovery failed; operator intervention required/);
    assert.doesNotMatch(fixture.result.stderr, /current was restored/);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    const manifests = regularFiles(resolve(fixture.releaseRoot, "manifests"));
    assert.equal(manifests.length, 1);
    assert.match(readFileSync(manifests[0], "utf8"), /smoke_results=failed-recovery-failed/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("approved rollback of a known release ignores dirty source and unusable HEAD", () => {
  const fixture = runRollbackScenario({ dirty: true, headFails: true });
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.previousRelease);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "previous")), fixture.currentRelease);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.ok(events.indexOf("smoke previous") < events.indexOf("pm2 save"), events);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

function regularFiles(directory) {
  return readdirSync(directory)
    .map((name) => resolve(directory, name))
    .filter((path) => statSync(path).isFile());
}

test("backup and release manifests are created with private directory and file modes", () => {
  const fixture = runRollbackScenario();
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    const backupDir = resolve(fixture.releaseRoot, "backups");
    const manifestDir = resolve(fixture.releaseRoot, "manifests");
    assert.equal(statSync(backupDir).mode & 0o777, 0o700);
    assert.equal(statSync(manifestDir).mode & 0o777, 0o700);
    for (const path of [...regularFiles(backupDir), ...regularFiles(manifestDir)]) {
      assert.equal(statSync(path).mode & 0o777, 0o600, `${path} was not mode 0600`);
    }
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("PM2 inventory fails closed on unrelated apps unless maintenance is separately approved", () => {
  const rejected = runRollbackScenario({ pm2Inventory: [{ name: "unrelated-app" }] });
  try {
    assert.notEqual(rejected.result.status, 0);
    assert.match(rejected.result.stderr, /PM2 inventory.*unrelated-app|unexpected PM2/i);
    assert.equal(realpathSync(resolve(rejected.releaseRoot, "current")), rejected.currentRelease);
  } finally {
    rmSync(rejected.sandbox, { recursive: true, force: true });
  }

  const approved = runRollbackScenario({
    pm2Inventory: [{ name: "unrelated-app" }],
    extraEnv: {
      VESSEL_PM2_MAINTENANCE_OVERRIDE: "YES",
      APPROVE_PM2_MAINTENANCE: "YES",
    },
  });
  try {
    assert.equal(approved.result.status, 0, approved.result.stderr);
  } finally {
    rmSync(approved.sandbox, { recursive: true, force: true });
  }
});

test("non-dedicated PM2_HOME requires both an explicit maintenance override and separate approval", () => {
  const customHome = "/tmp/not-the-dedicated-vessel-pm2-home";
  const rejected = runRollbackScenario({ pm2Home: customHome });
  try {
    assert.notEqual(rejected.result.status, 0);
    assert.match(rejected.result.stderr, /dedicated PM2_HOME|maintenance override/i);
  } finally {
    rmSync(rejected.sandbox, { recursive: true, force: true });
  }

  const notApproved = runRollbackScenario({
    pm2Home: customHome,
    extraEnv: { VESSEL_PM2_MAINTENANCE_OVERRIDE: "YES" },
  });
  try {
    assert.notEqual(notApproved.result.status, 0);
    assert.match(notApproved.result.stderr, /separate.*approval|APPROVE_PM2_MAINTENANCE/i);
  } finally {
    rmSync(notApproved.sandbox, { recursive: true, force: true });
  }

  const approved = runRollbackScenario({
    pm2Home: customHome,
    extraEnv: {
      VESSEL_PM2_MAINTENANCE_OVERRIDE: "YES",
      APPROVE_PM2_MAINTENANCE: "YES",
    },
  });
  try {
    assert.equal(approved.result.status, 0, approved.result.stderr);
  } finally {
    rmSync(approved.sandbox, { recursive: true, force: true });
  }
});

test("PM2 activation receives only the backend env path and excludes secret-bearing release env", () => {
  const fixture = runRollbackScenario({
    extraEnv: {
      POSTGRES_PASSWORD: "sentinel",
      DATALASTIC_API_KEY: "sentinel",
      ACCOUNTS: "sentinel",
      UNRELATED_SENTINEL: "sentinel",
    },
  });
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(events, /pm2 backend env path set/);
    assert.doesNotMatch(events, /pm2 secret env present/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("manifest finalization failure restores the previously active release", () => {
  const fixture = runRollbackScenario({ failChmodAt: 3 });
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "previous")), fixture.previousRelease);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("SIGTERM after either atomic link mutation restores both links exactly once", () => {
  for (const signalAfterMv of [1, 2]) {
    const fixture = runRollbackScenario({ signalAfterMv });
    try {
      assert.equal(fixture.result.status, 143, fixture.result.stderr);
      assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
      assert.equal(realpathSync(resolve(fixture.releaseRoot, "previous")), fixture.previousRelease);
      const events = readFileSync(fixture.eventLog, "utf8");
      assert.equal((events.match(/^smoke current$/gm) || []).length, 1, events);
      assert.doesNotMatch(events, /reload all|delete all|pm2 kill/);
      const manifests = regularFiles(resolve(fixture.releaseRoot, "manifests"));
      assert.equal(manifests.length, 1);
      assert.match(readFileSync(manifests[0], "utf8"), /result=failed/);
    } finally {
      rmSync(fixture.sandbox, { recursive: true, force: true });
    }
  }
});

test("SIGTERM when PM2 activation begins restores links and vessel-only PM2 state", () => {
  const fixture = runRollbackScenario({ signalOnPm2Activation: true });
  try {
    assert.equal(fixture.result.status, 143, fixture.result.stderr);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "current")), fixture.currentRelease);
    assert.equal(realpathSync(resolve(fixture.releaseRoot, "previous")), fixture.previousRelease);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(events, /smoke current/);
    assert.match(events, /pm2 save/);
    assert.doesNotMatch(events, /reload all|delete all|pm2 kill/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("release activation smoke pins the canonical public origin and drops caller environment", () => {
  const fixture = runRollbackScenario({
    extraEnv: {
      EXTERNAL_URL: "https://attacker.invalid",
      BASE_URL: "https://attacker.invalid/local",
      UNRELATED_SENTINEL: "must-not-reach-smoke",
    },
  });
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    const events = readFileSync(fixture.eventLog, "utf8");
    assert.match(
      events,
      /smoke environment EXTERNAL_URL=https:\/\/vessel\.ttacom\.net BASE_URL=http:\/\/127\.0\.0\.1:5173 UNRELATED_SENTINEL=unset/,
    );
    assert.doesNotMatch(events, /attacker\.invalid|must-not-reach-smoke/);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

function runDeployPreflight(revision, resolvedSha) {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-deploy-preflight-test-"));
  const repo = resolve(sandbox, "repo");
  const bin = resolve(sandbox, "bin");
  const releaseRoot = resolve(sandbox, "release-root");
  mkdirSync(resolve(repo, ".git"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  executable(resolve(bin, "git"), `#!/usr/bin/env bash
case "$*" in
  *"status --porcelain"*) exit 0 ;;
  *"rev-parse"*) printf '%s\\n' '${resolvedSha}' ;;
  *"cat-file -e"*) exit 0 ;;
  *) exit 0 ;;
esac
`);
  for (const command of ["npm", "npx", "docker", "pm2", "curl", "sha256sum"]) {
    executable(resolve(bin, command), "#!/usr/bin/env bash\nexit 91\n");
  }
  const result = spawnSync("bash", [resolve(root, "scripts/release.sh"), "deploy", revision], {
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
    },
  });
  return { sandbox, releaseRoot, result };
}

test("real deploy requires a full lowercase 40-hex immutable commit", () => {
  const fixture = runDeployPreflight("HEAD", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(fixture.result.stderr, /full.*40-hex|40-character full SHA/i);
    assert.equal(existsSync(fixture.releaseRoot), false);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("real deploy rejects a full SHA that does not resolve exactly", () => {
  const fixture = runDeployPreflight(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  );
  try {
    assert.notEqual(fixture.result.status, 0);
    assert.match(fixture.result.stderr, /does not resolve exactly|exact.*commit/i);
    assert.equal(existsSync(fixture.releaseRoot), false);
  } finally {
    rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});
