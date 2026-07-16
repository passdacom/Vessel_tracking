#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE_MIGRATION = "20260715100000_baseline";
const BASELINE_SHA256 = "cd47aff1ca4d90bf0e4094d86a8b0680593ac59ba4773704a8644c489409bab0";

export function assessLegacyBaseline({
  domainTableCount,
  migrationsTableExists,
  baselineSucceeded,
}) {
  if (!Number.isInteger(domainTableCount) || domainTableCount < 0) {
    throw new TypeError("domainTableCount must be a non-negative integer");
  }
  if (typeof migrationsTableExists !== "boolean" || typeof baselineSucceeded !== "boolean") {
    throw new TypeError("migration probe flags must be boolean");
  }
  if (domainTableCount === 0 && !migrationsTableExists) {
    return { allowed: true, state: "fresh-empty" };
  }
  if (domainTableCount > 0 && migrationsTableExists && baselineSucceeded) {
    return { allowed: true, state: "baseline-applied" };
  }
  return {
    allowed: false,
    state: "human-gate-required",
    message: "Human Gate: database state is neither fresh-empty nor a Vessel/domain schema with a successful 20260715100000_baseline migration. Stop before backup or database writes; obtain a reviewed schema diff and approval, then run `prisma migrate resolve --applied 20260715100000_baseline` manually. This release tool never auto-resolves migration history.",
  };
}

function splitSqlStatements(sql) {
  const statements = [];
  let buffer = "";
  let state = "normal";
  let blockDepth = 0;
  let dollarTag = "";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (character === "\n") {
        state = "normal";
        buffer += " ";
      }
      continue;
    }
    if (state === "block-comment") {
      if (character === "/" && next === "*") {
        blockDepth += 1;
        index += 1;
      } else if (character === "*" && next === "/") {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) {
          state = "normal";
          buffer += " ";
        }
      }
      continue;
    }
    if (state === "single-quote") {
      buffer += character;
      if (character === "'" && next === "'") {
        buffer += next;
        index += 1;
      } else if (character === "'") {
        state = "normal";
      }
      continue;
    }
    if (state === "double-quote") {
      buffer += character;
      if (character === '"' && next === '"') {
        buffer += next;
        index += 1;
      } else if (character === '"') {
        state = "normal";
      }
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        buffer += dollarTag;
        index += dollarTag.length - 1;
        state = "normal";
      } else {
        buffer += character;
      }
      continue;
    }

    if (character === "-" && next === "-") {
      state = "line-comment";
      index += 1;
    } else if (character === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      index += 1;
    } else if (character === "'") {
      state = "single-quote";
      buffer += character;
    } else if (character === '"') {
      state = "double-quote";
      buffer += character;
    } else if (character === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        state = "dollar-quote";
        buffer += dollarTag;
        index += dollarTag.length - 1;
      } else {
        buffer += character;
      }
    } else if (character === ";") {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = "";
    } else {
      buffer += character;
    }
  }

  if (state !== "normal" && state !== "line-comment") {
    statements.push("<unterminated SQL token>");
  } else if (buffer.trim()) {
    statements.push(buffer.trim());
  }
  return statements;
}

export function findDisallowedMigrationStatements(sql) {
  if (typeof sql !== "string") throw new TypeError("migration SQL must be a string");
  return splitSqlStatements(sql).filter(
    (statement) => !/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b[\s\S]*$/i.test(statement),
  );
}

function baselineIntegrityError() {
  return new Error(
    `${BASELINE_MIGRATION}/migration.sql: immutable reviewed baseline integrity check failed. ` +
    "Restore the exact reviewed baseline as a real migration directory and regular non-symlink file before release.",
  );
}

function validateBaselineMigration(directory, entries) {
  const baselineEntry = entries.find((entry) => entry.name === BASELINE_MIGRATION);
  if (!baselineEntry?.isDirectory()) throw baselineIntegrityError();

  const baselineDirectory = resolve(directory, BASELINE_MIGRATION);
  const sqlPath = resolve(baselineDirectory, "migration.sql");
  let sql;
  try {
    if (!lstatSync(baselineDirectory).isDirectory() || !lstatSync(sqlPath).isFile()) {
      throw baselineIntegrityError();
    }
    sql = readFileSync(sqlPath);
  } catch {
    throw baselineIntegrityError();
  }
  if (createHash("sha256").update(sql).digest("hex") !== BASELINE_SHA256) {
    throw baselineIntegrityError();
  }
}

function validateMigrationDirectory(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  validateBaselineMigration(directory, entries);
  const migrations = [];
  for (const entry of entries) {
    if (entry.name === "migration_lock.toml" && entry.isFile()) continue;
    if (!entry.isDirectory()) {
      throw new Error(`${entry.name}: expected a regular migration directory; symlinks are forbidden`);
    }
    migrations.push(entry.name);
  }
  for (const migration of migrations) {
    if (migration === BASELINE_MIGRATION) continue;
    const sqlPath = resolve(directory, migration, "migration.sql");
    if (!lstatSync(sqlPath).isFile()) {
      throw new Error(`${migration}: migration.sql must be a regular file; symlinks are forbidden`);
    }
    const disallowed = findDisallowedMigrationStatements(readFileSync(sqlPath, "utf8"));
    if (disallowed.length > 0) {
      const preview = disallowed[0].replaceAll(/\s+/g, " ").slice(0, 160);
      throw new Error(
        `${migration}: release rollback contract is index-only additive SQL (` +
        `CREATE [UNIQUE] INDEX ... IF NOT EXISTS). Rejected: ${preview}. ` +
        "Use a separately reviewed expand/contract deployment design.",
      );
    }
  }
}

function parseProbeFlag(value) {
  if (value === "t" || value === "true" || value === "1") return true;
  if (value === "f" || value === "false" || value === "0") return false;
  throw new Error("invalid baseline probe output");
}

function readStdin() {
  return readFileSync(0, "utf8");
}

function main(argv) {
  const [command, argument] = argv;
  if (command === "baseline") {
    const fields = readStdin().trim().split("\t");
    if (fields.length !== 3) throw new Error("invalid baseline probe output");
    const decision = assessLegacyBaseline({
      domainTableCount: Number(fields[0]),
      migrationsTableExists: parseProbeFlag(fields[1]),
      baselineSucceeded: parseProbeFlag(fields[2]),
    });
    if (!decision.allowed) throw new Error(decision.message);
    process.stdout.write(`[OK] migration baseline preflight: ${decision.state}\n`);
    return;
  }
  if (command === "migrations" && argument) {
    validateMigrationDirectory(argument);
    process.stdout.write("[OK] post-baseline migrations satisfy index-only rollback contract\n");
    return;
  }
  throw new Error("Usage: release-gates.mjs baseline | migrations <directory>");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[FAIL] ${error.message}\n`);
    process.exitCode = 65;
  }
}
