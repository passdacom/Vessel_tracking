import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(backendDir, "..");
const coastalSourceName = "marine-regions-territorial-seas-v4-syr-rus.geojson";
const coastalManifestName = "marine-regions-territorial-seas-v4-syr-rus.manifest.json";
const expectedCoastalSha256 = "00b007a2a76df5b7a59fc8349c0184d1f561da12c3cec5f5acf65d5f10ad4a6f";
const outputNames = [
  "jwla-034-reference.geojson",
  "jwla-034-coastal-waters.geojson",
  "jwla-034-amendments.geojson",
  "jwla-034-countries.geojson",
  "jwla-034-installations.geojson",
];
const transactionJournalName = ".jwla-034-generation-transaction.json";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("pinned Marine Regions Territorial Seas v4 subset has complete verified provenance", () => {
  const sourcePath = path.join(backendDir, "reference-data", coastalSourceName);
  const manifestPath = path.join(backendDir, "reference-data", coastalManifestName);
  assert.equal(fs.existsSync(sourcePath), true, "pinned coastal source is missing");
  assert.equal(fs.existsSync(manifestPath), true, "pinned coastal manifest is missing");

  const sourceBytes = fs.readFileSync(sourcePath);
  const source = JSON.parse(sourceBytes);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(sha256(sourceBytes), expectedCoastalSha256);
  assert.equal(manifest.artifactSha256, expectedCoastalSha256);
  assert.equal(manifest.dataset, "World 12 Nautical Miles Zone (Territorial Seas)");
  assert.equal(manifest.version, "v4");
  assert.equal(manifest.publishedAt, "2023-10-25");
  assert.equal(manifest.downloadedAt, "2026-08-02");
  assert.equal(manifest.license, "CC BY 4.0");
  assert.match(manifest.licenseUrl, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(manifest.sourceUrl, /marineregions\.org\/downloads\.php/);
  assert.match(manifest.wfsEndpoint, /geo\.vliz\.be\/geoserver\/MarineRegions\/ows/);
  assert.equal(manifest.retrievalScript, "backend/scripts/fetch-marine-regions-territorial-seas.mjs");
  assert.equal(manifest.hashAlgorithm, "SHA-256");
  assert.match(manifest.hashScope, /exact raw bytes/i);
  assert.deepEqual(manifest.features, [
    { mrgid: 49096, iso3: "SYR", geoname: "Syrian 12 NM" },
    { mrgid: 49031, iso3: "RUS", geoname: "Russian 12 NM" },
  ]);
  assert.deepEqual(source.features.map((feature) => ({
    mrgid: feature.properties?.mrgid,
    iso3: feature.properties?.iso_ter1,
    geoname: feature.properties?.geoname,
  })), manifest.features);
});

test("JWLA-034 generator fails closed without replacing outputs when pinned coastal source is invalid", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-034-fail-closed-"));
  try {
    const tempBackend = path.join(root, "backend");
    const tempPublic = path.join(root, "frontend", "public");
    const tempReferenceData = path.join(tempBackend, "reference-data");
    const tempOutput = path.join(tempPublic, "risk-areas");
    fs.mkdirSync(tempReferenceData, { recursive: true });
    fs.mkdirSync(tempOutput, { recursive: true });

    fs.copyFileSync(path.join(backendDir, "generate_jwla034_reference.mjs"), path.join(tempBackend, "generate_jwla034_reference.mjs"));
    for (const name of ["countries.geojson", "iho_red_sea.geojson"]) {
      fs.copyFileSync(path.join(backendDir, name), path.join(tempBackend, name));
    }
    for (const name of ["war-risk-zone.geojson", "war-risk-zone-global.geojson"]) {
      fs.copyFileSync(path.join(rootDir, "frontend", "public", name), path.join(tempPublic, name));
    }
    for (const name of [coastalSourceName, coastalManifestName]) {
      fs.copyFileSync(path.join(backendDir, "reference-data", name), path.join(tempReferenceData, name));
    }
    fs.symlinkSync(path.join(backendDir, "node_modules"), path.join(tempBackend, "node_modules"), "dir");

    fs.writeFileSync(path.join(tempReferenceData, coastalSourceName), '{"type":"FeatureCollection","features":[]}\n');
    for (const name of outputNames) fs.writeFileSync(path.join(tempOutput, name), `sentinel:${name}`);

    const result = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
    });

    assert.notEqual(result.status, 0, `generator unexpectedly succeeded:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /hash|manifest|coastal/i);
    for (const name of outputNames) {
      assert.equal(fs.readFileSync(path.join(tempOutput, name), "utf8"), `sentinel:${name}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function copyGeneratorFixture(tempRoot) {
  const tempBackend = path.join(tempRoot, "backend");
  const tempPublic = path.join(tempRoot, "frontend", "public");
  const tempReferenceData = path.join(tempBackend, "reference-data");
  const tempOutput = path.join(tempPublic, "risk-areas");
  fs.mkdirSync(tempReferenceData, { recursive: true });
  fs.mkdirSync(tempOutput, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "generate_jwla034_reference.mjs"), path.join(tempBackend, "generate_jwla034_reference.mjs"));
  for (const name of ["countries.geojson", "iho_red_sea.geojson"]) fs.copyFileSync(path.join(backendDir, name), path.join(tempBackend, name));
  for (const name of ["war-risk-zone.geojson", "war-risk-zone-global.geojson"]) fs.copyFileSync(path.join(rootDir, "frontend", "public", name), path.join(tempPublic, name));
  for (const name of [coastalSourceName, coastalManifestName]) fs.copyFileSync(path.join(backendDir, "reference-data", name), path.join(tempReferenceData, name));
  fs.symlinkSync(path.join(backendDir, "node_modules"), path.join(tempBackend, "node_modules"), "dir");
  return { tempBackend, tempOutput };
}

test("JWLA-034 generator recovers a prepared journal after SIGKILL before validating inputs", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-034-rollback-"));
  try {
    const { tempBackend, tempOutput } = copyGeneratorFixture(tempRoot);
    const priorNames = outputNames.filter((name) => name !== "jwla-034-coastal-waters.geojson");
    const sentinels = new Map(priorNames.map((name, index) => [name, Buffer.from(`prior-byte-generation-${index}:${name}\0`)]));
    for (const [name, bytes] of sentinels) fs.writeFileSync(path.join(tempOutput, name), bytes);
    const unrelated = path.join(tempOutput, "unrelated.stage-do-not-delete");
    fs.writeFileSync(unrelated, "unrelated-sentinel");
    const killed = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NODE_ENV: "test", JWLA034_TEST_SIGKILL_AFTER_REPLACEMENTS: "3" },
    });
    assert.equal(killed.signal, "SIGKILL", `generator was not SIGKILLed:\n${killed.stdout}\n${killed.stderr}`);
    assert.equal(fs.existsSync(path.join(tempOutput, transactionJournalName)), true, "prepared journal was not durable");
    assert.equal(fs.existsSync(path.join(tempOutput, "jwla-034-coastal-waters.geojson")), true, "absent coastal output was not replaced before the kill");

    fs.writeFileSync(path.join(tempBackend, "reference-data", coastalSourceName), "{invalid-after-crash");
    const recovered = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(recovered.status, 0, "invalid source unexpectedly published after recovery");
    assert.match(recovered.stderr, /hash|json|coastal|unexpected/i);
    for (const [name, bytes] of sentinels) assert.deepEqual(fs.readFileSync(path.join(tempOutput, name)), bytes, `${name} was not recovered byte-for-byte`);
    assert.equal(fs.existsSync(path.join(tempOutput, "jwla-034-coastal-waters.geojson")), false, "recovery kept an output that did not previously exist");
    assert.equal(fs.existsSync(path.join(tempOutput, transactionJournalName)), false, "recovery did not remove the journal");
    assert.deepEqual(fs.readdirSync(tempOutput).filter((name) => /jwla-034-.*\.(?:stage|backup)-/.test(name)), []);
    assert.equal(fs.readFileSync(unrelated, "utf8"), "unrelated-sentinel", "recovery glob-deleted an unrelated path");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("JWLA-034 recovery is re-entrant after SIGKILL during rollback cleanup", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-034-recovery-cleanup-"));
  try {
    const { tempBackend, tempOutput } = copyGeneratorFixture(tempRoot);
    const priorNames = outputNames.filter((name) => name !== "jwla-034-coastal-waters.geojson");
    const sentinels = new Map(priorNames.map((name, index) => [name, Buffer.from(`cleanup-prior-${index}:${name}\0`)]));
    for (const [name, bytes] of sentinels) fs.writeFileSync(path.join(tempOutput, name), bytes);

    const publishKilled = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NODE_ENV: "test", JWLA034_TEST_SIGKILL_AFTER_REPLACEMENTS: "3" },
    });
    assert.equal(publishKilled.signal, "SIGKILL");

    fs.writeFileSync(path.join(tempBackend, "reference-data", coastalSourceName), "{invalid-after-crash");
    const cleanupKilled = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NODE_ENV: "test", JWLA034_TEST_SIGKILL_AFTER_RECOVERY_CLEANUPS: "1" },
    });
    assert.equal(cleanupKilled.signal, "SIGKILL", `recovery cleanup was not SIGKILLed:\n${cleanupKilled.stdout}\n${cleanupKilled.stderr}`);
    const journalAfterCleanupCrash = JSON.parse(fs.readFileSync(path.join(tempOutput, transactionJournalName), "utf8"));
    assert.equal(journalAfterCleanupCrash.phase, "rolled-back");
    for (const [name, bytes] of sentinels) assert.deepEqual(fs.readFileSync(path.join(tempOutput, name)), bytes);

    const recoveredAgain = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(recoveredAgain.status, 0, "invalid source unexpectedly published after re-entrant recovery");
    assert.match(recoveredAgain.stderr, /hash|json|coastal|unexpected/i);
    for (const [name, bytes] of sentinels) assert.deepEqual(fs.readFileSync(path.join(tempOutput, name)), bytes);
    assert.equal(fs.existsSync(path.join(tempOutput, "jwla-034-coastal-waters.geojson")), false);
    assert.equal(fs.existsSync(path.join(tempOutput, transactionJournalName)), false);
    assert.deepEqual(fs.readdirSync(tempOutput).filter((name) => /jwla-034-.*\.(?:stage|backup|restore)-/.test(name)), []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("JWLA-034 generator fails closed on a malformed transaction journal without touching outputs", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-034-malformed-journal-"));
  try {
    const { tempBackend, tempOutput } = copyGeneratorFixture(tempRoot);
    const sentinels = new Map(outputNames.map((name, index) => [name, Buffer.from(`malformed-journal-prior-${index}\0`)]));
    for (const [name, bytes] of sentinels) fs.writeFileSync(path.join(tempOutput, name), bytes);
    const journalPath = path.join(tempOutput, transactionJournalName);
    const malformed = Buffer.from('{"version":1,"phase":"prepared","entries":[{"final":"../escape"}]}');
    fs.writeFileSync(journalPath, malformed);
    const result = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend, encoding: "utf8", timeout: 30_000,
    });
    assert.notEqual(result.status, 0, "malformed journal unexpectedly allowed generation");
    assert.match(result.stderr, /journal|transaction|invalid/i);
    for (const [name, bytes] of sentinels) assert.deepEqual(fs.readFileSync(path.join(tempOutput, name)), bytes);
    assert.deepEqual(fs.readFileSync(journalPath), malformed, "malformed journal was modified");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("JWLA-034 SIGKILL injection is ignored outside NODE_ENV=test", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-034-production-injection-"));
  try {
    const { tempBackend } = copyGeneratorFixture(tempRoot);
    const result = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend,
      encoding: "utf8",
      timeout: 30_000,
      env: { ...process.env, NODE_ENV: "production", JWLA034_TEST_SIGKILL_AFTER_REPLACEMENTS: "1" },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function coordinateCount(geometry) {
  let count = 0;
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) { count += 1; return; }
    value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return count;
}

function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      bounds[0] = Math.min(bounds[0], value[0]); bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]); bounds[3] = Math.max(bounds[3], value[1]); return;
    }
    value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return bounds;
}

test("generated coastal asset preserves the exact reviewed geometry and bounded schema without routine deep topology", () => {
  const sourceBytes = fs.readFileSync(path.join(backendDir, "reference-data", coastalSourceName));
  const source = JSON.parse(sourceBytes);
  const generatedPath = path.join(rootDir, "frontend", "public", "risk-areas", "jwla-034-coastal-waters.geojson");
  assert.equal(fs.existsSync(generatedPath), true, "dedicated coastal asset is missing");
  const generatedBytes = fs.readFileSync(generatedPath);
  const generated = JSON.parse(generatedBytes);
  assert.equal(sha256(sourceBytes), expectedCoastalSha256);
  assert.equal(generated.type, "FeatureCollection");
  assert.equal(generated.features.length, 2);
  assert.deepEqual(generated.features.map((feature) => feature.geometry), source.features.map((feature) => feature.geometry));
  assert.deepEqual(generated.features.map((feature) => feature.geometry.type), ["MultiPolygon", "MultiPolygon"]);
  assert.deepEqual(generated.features.map((feature) => coordinateCount(feature.geometry)), [824, 136129]);
  assert.deepEqual(generated.features.map((feature) => geometryBounds(feature.geometry)), [
    [35.47134643, 34.59925086, 35.97254309, 36.03456464],
    [-180, 41.84196511, 180, 82.05827656],
  ]);
  assert.equal(generated.features[1].geometry.coordinates.length, 36);
  const russianPolygonBounds = generated.features[1].geometry.coordinates.map((coordinates) => geometryBounds({ coordinates }));
  for (const [label, fixture] of [
    ["Black Sea", [36, 44, 40, 46]], ["Baltic", [27, 54, 33, 61]],
    ["Pacific", [130, 42, 180, 66]], ["Arctic", [30, 65, 180, 82]],
  ]) assert.ok(russianPolygonBounds.some(([minX, minY, maxX, maxY]) => minX <= fixture[2] && maxX >= fixture[0] && minY <= fixture[3] && maxY >= fixture[1]), `${label} representative basin extent is missing`);
  assert.ok(generatedBytes.length <= 6_500_000, `coastal asset exceeds byte budget: ${generatedBytes.length}`);
  assert.ok(generated.features.reduce((sum, feature) => sum + coordinateCount(feature.geometry), 0) <= 235_000);
  for (const feature of generated.features) {
    assert.equal(feature.properties.hashAlgorithm, "SHA-256");
    assert.equal(feature.properties.sourceDocumentSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");
    assert.equal(feature.properties.sourceArtifactSha256, expectedCoastalSha256);
    assert.match(feature.properties.hashScope, /sourceDocumentSha256 hashes raw official circular PDF bytes/);
    assert.match(feature.properties.hashScope, /sourceArtifactSha256 hashes raw pinned geometry artifact bytes/);
    assert.equal(feature.properties.license, "CC BY 4.0");
    assert.equal(feature.properties.licenseUrl, "https://creativecommons.org/licenses/by/4.0/");
    assert.match(feature.properties.attribution, /Marine Regions.*VLIZ/i);
    assert.equal(feature.properties.subsetStatus, "reviewed-subset");
    assert.equal(feature.properties.derivedStatus, "derived-display-reference");
  }
});

test("Python coastal retrieval atomically fsyncs with unique temporary cleanup on success and replace failure", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "marine-retrieval-atomic-"));
  try {
    const helper = path.join(backendDir, "scripts", "fetch-marine-regions-territorial-seas.py");
    const program = String.raw`
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location("marine_fetch", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root = pathlib.Path(sys.argv[2])
out = root / "pin.geojson"
out.write_bytes(b"prior")
module.atomic_replace(out, b"next")
assert out.read_bytes() == b"next"
assert list(root.glob(".pin.geojson.*.tmp")) == []
out.write_bytes(b"prior-again")
original_replace = module.os.replace
module.os.replace = lambda *_: (_ for _ in ()).throw(OSError("injected replace failure"))
try:
    module.atomic_replace(out, b"never-published")
except OSError:
    pass
else:
    raise AssertionError("replace failure was not propagated")
finally:
    module.os.replace = original_replace
assert out.read_bytes() == b"prior-again"
assert list(root.glob(".pin.geojson.*.tmp")) == []
`;
    const result = spawnSync("python3", ["-c", program, helper, tempRoot], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("backend geofence implementation and its three boundary inputs keep their approved digests", () => {
  const expected = new Map([
    ["backend/src/services/geofenceChecker.js", "753ba3d74b44e63a08064c97ef7228621bcbf0a31bb04906d150259dcdb09d83"],
    ["frontend/public/war-risk-zone.geojson", "a8ed1684db314eb1161957aa14f18c6129036ff47bf10a53ee619046fe89e56c"],
    ["frontend/public/12nm_bounds.geojson", "0a70346fac027f6bf4bb53e68a55e32c9d931b99389e7afd990e0fe6768a0f3b"],
    ["frontend/public/war-risk-zone-global.geojson", "58a9dedb2fac16a6008208468fba76924f3db52fc0eb022044b62425938ab94d"],
  ]);
  for (const [relativePath, digest] of expected) {
    assert.equal(sha256(fs.readFileSync(path.join(rootDir, relativePath))), digest, relativePath);
  }
});

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
