import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("global zone generator fails closed without replacing output when Black Sea input is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-global-fail-closed-"));
  try {
    const tempBackend = path.join(root, "backend");
    const tempPublic = path.join(root, "frontend", "public");
    fs.mkdirSync(tempBackend, { recursive: true });
    fs.mkdirSync(tempPublic, { recursive: true });

    const scriptName = "generate_global_zones.mjs";
    const source = fs.readFileSync(path.join(backendDir, scriptName), "utf8");
    fs.writeFileSync(path.join(tempBackend, scriptName), source);
    const inputs = [...new Set([...source.matchAll(/readFileSync\("\.\/([^"\n]+)"/g)].map((match) => match[1]))];
    for (const input of inputs) {
      fs.copyFileSync(path.join(backendDir, input), path.join(tempBackend, input));
    }
    fs.symlinkSync(path.join(backendDir, "node_modules"), path.join(tempBackend, "node_modules"), "dir");

    fs.writeFileSync(path.join(tempBackend, "iho_black_sea.geojson"), "{invalid-json");
    const output = path.join(tempPublic, "war-risk-zone-global.geojson");
    const sentinel = "do-not-replace";
    fs.writeFileSync(output, sentinel);

    const result = spawnSync(process.execPath, [scriptName], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
    });

    assert.notEqual(result.status, 0, `generator unexpectedly succeeded:\n${result.stdout}\n${result.stderr}`);
    assert.equal(fs.readFileSync(output, "utf8"), sentinel);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
