import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assessLegacyBaseline,
  findDisallowedMigrationStatements,
} from "../../scripts/release-gates.mjs";

const root = resolve(import.meta.dirname, "../..");
const gateCli = resolve(root, "scripts/release-gates.mjs");
const canonicalBaselineSql = readFileSync(
  resolve(root, "backend/prisma/migrations/20260715100000_baseline/migration.sql"),
  "utf8",
);

function writeMigration(rootDir, name, sql) {
  const directory = resolve(rootDir, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "migration.sql"), sql);
}

test("legacy baseline decision allows a fresh database and a successfully baselined existing database", () => {
  assert.deepEqual(
    assessLegacyBaseline({
      domainTableCount: 0,
      migrationsTableExists: false,
      baselineSucceeded: false,
    }),
    { allowed: true, state: "fresh-empty" },
  );
  assert.deepEqual(
    assessLegacyBaseline({
      domainTableCount: 3,
      migrationsTableExists: true,
      baselineSucceeded: true,
    }),
    { allowed: true, state: "baseline-applied" },
  );
});

test("legacy baseline decision fails closed unless an empty database has no migration metadata", () => {
  for (const probe of [
    { domainTableCount: 0, migrationsTableExists: true, baselineSucceeded: false },
    { domainTableCount: 0, migrationsTableExists: true, baselineSucceeded: true },
    { domainTableCount: 1, migrationsTableExists: false, baselineSucceeded: false },
    { domainTableCount: 1, migrationsTableExists: true, baselineSucceeded: false },
  ]) {
    const decision = assessLegacyBaseline(probe);
    assert.equal(decision.allowed, false);
    assert.equal(decision.state, "human-gate-required");
    assert.match(decision.message, /Human Gate/);
    assert.match(decision.message, /reviewed schema diff/i);
    assert.match(decision.message, /prisma migrate resolve --applied 20260715100000_baseline/);
  }
});

test("post-baseline migration contract allows only idempotent additive indexes and comments", () => {
  const sql = `
-- additive indexes only
CREATE INDEX IF NOT EXISTS "Vessel_active_idx" ON "Vessel"("active");
/* an empty statement follows */ ;
CREATE UNIQUE INDEX IF NOT EXISTS "Account_name_key" ON "Account"("name");
`;
  assert.deepEqual(findDisallowedMigrationStatements(sql), []);
});

test("post-baseline migration contract rejects non-index and non-idempotent statements", () => {
  for (const sql of [
    "CREATE INDEX idx_vessel ON \"Vessel\"(\"active\");",
    "ALTER TABLE \"Vessel\" ADD COLUMN \"risk\" TEXT;",
    "DROP INDEX \"Vessel_active_idx\";",
    "DELETE FROM \"Position\";",
    "UPDATE \"Vessel\" SET \"active\" = false;",
    "TRUNCATE TABLE \"Position\";",
    "CREATE TABLE \"Other\" (\"id\" INTEGER);",
    "CREATE INDEX IF NOT EXISTS idx_vessel ON \"Vessel\"(\"active\"); RENAME TABLE x TO y;",
  ]) {
    assert.equal(findDisallowedMigrationStatements(sql).length, 1, sql);
  }
});

test("release gate CLI reports baseline Human Gate without echoing unrelated input", () => {
  const marker = "postgresql://must-not-appear.invalid/secret";
  const result = spawnSync(process.execPath, [gateCli, "baseline"], {
    encoding: "utf8",
    input: "2\tf\tf\n",
    env: { ...process.env, DATABASE_URL: marker },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Human Gate/);
  assert.match(result.stderr, /prisma migrate resolve --applied 20260715100000_baseline/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(marker.replaceAll("/", "\\/")));
});

test("migration CLI exempts the baseline, accepts additive indexes, and rejects later ALTER before deploy", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-release-gates-test-"));
  try {
    writeMigration(sandbox, "20260715100000_baseline", canonicalBaselineSql);
    writeMigration(
      sandbox,
      "20260715110000_indexes",
      "CREATE INDEX IF NOT EXISTS idx_ok ON \"Vessel\"(\"active\");\n",
    );
    const allowed = spawnSync(process.execPath, [gateCli, "migrations", sandbox], { encoding: "utf8" });
    assert.equal(allowed.status, 0, allowed.stderr);

    writeMigration(
      sandbox,
      "20260715120000_breaking",
      "ALTER TABLE \"Vessel\" RENAME COLUMN \"name\" TO \"displayName\";\n",
    );
    const rejected = spawnSync(process.execPath, [gateCli, "migrations", sandbox], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /index-only|expand\/contract/i);
    assert.match(rejected.stderr, /20260715120000_breaking/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("migration CLI requires the immutable reviewed baseline", () => {
  for (const baselineSql of [null, "MUTATED_BASELINE_SQL_MUST_NOT_BE_PRINTED\n"]) {
    const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-release-baseline-integrity-test-"));
    try {
      if (baselineSql !== null) {
        writeMigration(sandbox, "20260715100000_baseline", baselineSql);
      }
      writeMigration(
        sandbox,
        "20260715110000_indexes",
        "CREATE INDEX IF NOT EXISTS idx_ok ON \"Vessel\"(\"active\");\n",
      );
      const result = spawnSync(process.execPath, [gateCli, "migrations", sandbox], { encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /immutable reviewed baseline integrity/i);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /MUTATED_BASELINE_SQL_MUST_NOT_BE_PRINTED/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
});

test("migration CLI rejects a symlinked baseline migration file", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-release-baseline-symlink-test-"));
  const externalSql = `${sandbox}-baseline.sql`;
  try {
    const baselineDir = resolve(sandbox, "20260715100000_baseline");
    mkdirSync(baselineDir, { recursive: true });
    writeFileSync(externalSql, canonicalBaselineSql);
    symlinkSync(externalSql, resolve(baselineDir, "migration.sql"));
    const result = spawnSync(process.execPath, [gateCli, "migrations", sandbox], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /immutable reviewed baseline integrity/i);
  } finally {
    rmSync(externalSql, { force: true });
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("migration CLI fails closed on a symlinked migration directory", () => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "vessel-release-gates-symlink-test-"));
  const externalMigration = `${sandbox}-external`;
  try {
    writeMigration(sandbox, "20260715100000_baseline", canonicalBaselineSql);
    mkdirSync(externalMigration, { recursive: true });
    writeFileSync(resolve(externalMigration, "migration.sql"), "ALTER TABLE \"Vessel\" ADD COLUMN bypass TEXT;\n");
    symlinkSync(externalMigration, resolve(sandbox, "20260715120000_symlink"));
    const result = spawnSync(process.execPath, [gateCli, "migrations", sandbox], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink|regular migration directory/i);
  } finally {
    rmSync(externalMigration, { recursive: true, force: true });
    rmSync(sandbox, { recursive: true, force: true });
  }
});
