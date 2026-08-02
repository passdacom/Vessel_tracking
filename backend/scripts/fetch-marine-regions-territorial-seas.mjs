#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "fetch-marine-regions-territorial-seas.py");
const result = spawnSync("python3", [script], { stdio: "inherit" });
if (result.error) {
  console.error(`Unable to run Python retrieval helper: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
