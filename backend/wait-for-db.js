#!/usr/bin/env node
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";

const MAX_WAIT_MS = 120_000;
const RETRY_INTERVAL_MS = 2_000;

// backend/src의 process.env 사용처 + Prisma/Node 런타임에 필요한 키만 전달한다.
export const BACKEND_ENV_ALLOWLIST = Object.freeze([
  "NODE_ENV",
  "HOST",
  "PORT",
  "DATABASE_URL",
  "ALLOWED_ORIGINS",
  "ACCOUNTS",
  "DATALASTIC_API_KEY",
  "DATALASTIC_CREDIT_RESERVE",
  "DATALASTIC_CREDIT_STATUS_MAX_AGE_MS",
  "AISSTREAM_API_KEY",
  "VESSELFINDER_API_KEY",
  "API_CREDITS_BASELINE",
  "SHUTDOWN_TIMEOUT_MS",
  "VESSEL_LOG_DIR",
  "VESSEL_DB_WAIT_MAX_MS",
  "VESSEL_DB_WAIT_RETRY_MS",
  "TZ",
]);

export function buildAllowedEnv(source = process.env) {
  return Object.fromEntries(
    BACKEND_ENV_ALLOWLIST
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

export function loadBackendEnv({
  env = process.env,
  cwd = process.cwd(),
  exists = existsSync,
  stat = lstatSync,
  readFile = readFileSync,
  processRef = process,
} = {}) {
  const explicitPath = env.VESSEL_BACKEND_ENV_FILE;
  const envFile = explicitPath || resolve(cwd, ".env");
  let fileEnv = {};

  if (explicitPath && !isAbsolute(explicitPath)) {
    throw new Error("VESSEL_BACKEND_ENV_FILE must be an absolute path");
  }
  if (explicitPath || exists(envFile)) {
    const fileStat = stat(envFile);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new Error(`backend env path must be a regular non-symlink file: ${envFile}`);
    }
    if (explicitPath && (fileStat.mode & 0o077) !== 0) {
      throw new Error(`backend env file permissions must be 0600 or stricter: ${envFile}`);
    }
    if (
      explicitPath
      && typeof processRef.geteuid === "function"
      && processRef.geteuid() === 0
      && fileStat.uid !== 0
    ) {
      throw new Error(`backend env file must be owned by root: ${envFile}`);
    }
    fileEnv = dotenv.parse(readFile(envFile));
  }

  return buildAllowedEnv({ ...fileEnv, ...env });
}

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (
    !/^\d+$/.test(String(value))
    || !Number.isSafeInteger(parsed)
    || parsed <= 0
    || parsed > 2_147_483_647
  ) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export async function waitForDb({
  PrismaClientClass = PrismaClient,
  env,
  maxWaitMs = MAX_WAIT_MS,
  retryIntervalMs = RETRY_INTERVAL_MS,
  now = () => Date.now(),
  sleep = (delay) => new Promise((resolveSleep) => setTimeout(resolveSleep, delay)),
} = {}) {
  const deadline = now() + maxWaitMs;
  const clientOptions = env?.DATABASE_URL
    ? { datasources: { db: { url: env.DATABASE_URL } } }
    : undefined;
  const client = new PrismaClientClass(clientOptions);
  let attempt = 0;
  try {
    while (now() < deadline) {
      attempt += 1;
      try {
        await client.$queryRaw`SELECT 1`;
        console.log(`[wait-for-db] database readiness query succeeded (attempt ${attempt})`);
        return { attempts: attempt };
      } catch {
        const remainingMs = Math.max(0, deadline - now());
        console.log(`[wait-for-db] database not ready (attempt ${attempt}, remaining ${remainingMs}ms)`);
        if (remainingMs === 0) break;
        await sleep(Math.min(retryIntervalMs, remainingMs));
      }
    }
  } finally {
    await client.$disconnect().catch(() => {});
  }
  throw new Error(`database readiness timed out after ${maxWaitMs}ms`);
}

export function spawnBackend({
  spawnFn = spawn,
  env = process.env,
  processRef = process,
} = {}) {
  const child = spawnFn(processRef.execPath, ["src/index.js"], {
    stdio: "inherit",
    env: buildAllowedEnv(env),
  });
  const forwardSignal = (signal) => {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  };
  const onSigterm = () => forwardSignal("SIGTERM");
  const onSigint = () => forwardSignal("SIGINT");
  processRef.once("SIGTERM", onSigterm);
  processRef.once("SIGINT", onSigint);
  child.once("exit", (code, signal) => {
    processRef.removeListener("SIGTERM", onSigterm);
    processRef.removeListener("SIGINT", onSigint);
    processRef.exitCode = code ?? (signal ? 1 : 0);
  });
  return child;
}

export async function main() {
  const runtimeEnv = loadBackendEnv();
  if (!runtimeEnv.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in the reviewed backend environment");
  }
  const maxWaitMs = positiveInteger(
    runtimeEnv.VESSEL_DB_WAIT_MAX_MS,
    MAX_WAIT_MS,
    "VESSEL_DB_WAIT_MAX_MS",
  );
  const retryIntervalMs = positiveInteger(
    runtimeEnv.VESSEL_DB_WAIT_RETRY_MS,
    RETRY_INTERVAL_MS,
    "VESSEL_DB_WAIT_RETRY_MS",
  );
  await waitForDb({ env: runtimeEnv, maxWaitMs, retryIntervalMs });
  return spawnBackend({ env: runtimeEnv });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`[wait-for-db] startup blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
