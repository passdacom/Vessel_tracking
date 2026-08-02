import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(backendDir, "..");
const referenceDir = path.join(backendDir, "reference-data");
const scriptPath = path.join(backendDir, "scripts", "derive-jwla034-precision-references.py");
const subsetName = "natural-earth-v5.1.2-jwla034-precision-subsets.geojson";
const artifactName = "jwla-034-precision-references.source.geojson";
const manifestName = "jwla-034-precision-references.manifest.json";
const generatedName = "jwla-034-precision-references.geojson";
const ids = [
  "jwla-034:precision:black-sea-azov-marine",
  "jwla-034:precision:gulf-of-guinea-water",
  "jwla-034:precision:iran-caspian-12nm",
];
const expectedSourceHashes = {
  officialCircular: "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9",
  naturalEarthOcean: "f9696a1337c746a0f6c8c13bc60d0f230d2ef8d105198d5657726c8f8e763fc2",
  naturalEarthAdmin0Countries: "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fixtureCopy(tempRoot) {
  const tempBackend = path.join(tempRoot, "backend");
  const tempReference = path.join(tempBackend, "reference-data");
  const tempPublic = path.join(tempRoot, "frontend", "public");
  const tempOutput = path.join(tempPublic, "risk-areas");
  fs.mkdirSync(path.join(tempBackend, "scripts"), { recursive: true });
  fs.mkdirSync(tempReference, { recursive: true });
  fs.mkdirSync(tempOutput, { recursive: true });
  fs.copyFileSync(path.join(backendDir, "generate_jwla034_reference.mjs"), path.join(tempBackend, "generate_jwla034_reference.mjs"));
  fs.copyFileSync(scriptPath, path.join(tempBackend, "scripts", path.basename(scriptPath)));
  for (const name of ["countries.geojson", "iho_red_sea.geojson"]) fs.copyFileSync(path.join(backendDir, name), path.join(tempBackend, name));
  for (const name of ["war-risk-zone.geojson", "war-risk-zone-global.geojson"]) fs.copyFileSync(path.join(rootDir, "frontend", "public", name), path.join(tempPublic, name));
  for (const name of fs.readdirSync(referenceDir)) fs.copyFileSync(path.join(referenceDir, name), path.join(tempReference, name));
  fs.symlinkSync(path.join(backendDir, "node_modules"), path.join(tempBackend, "node_modules"), "dir");
  return { tempBackend, tempReference, tempOutput };
}

function runDerivation(referenceDirectory, extra = [], env = {}) {
  return spawnSync("python3", [scriptPath, "--reference-dir", referenceDirectory, ...extra], {
    cwd: backendDir, encoding: "utf8", timeout: 60_000, env: { ...process.env, ...env },
  });
}

function transactionEntries(names, token, existed = true) {
  return names.map((name) => ({
    name,
    finalName: name,
    stageName: `${name}.stage-${token}`,
    backupName: `${name}.backup-${token}`,
    restoreName: `${name}.restore-${token}`,
    existed,
  }));
}

test("precision derivation recipe pins exact official and Natural Earth source identities", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  assert.match(source, /shapely/i);
  assert.match(source, /pyproj/i);
  assert.match(source, /2\.1/);
  assert.match(source, /3\.7/);
  assert.match(source, /v5\.1\.2/);
  assert.match(source, /f1890d9f152c896d250a77557a5751a93d494776/);
  for (const digest of Object.values(expectedSourceHashes)) assert.match(source, new RegExp(digest));
  assert.match(source, /raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\/v5\.1\.2\/geojson\/ne_10m_ocean\.geojson/);
  assert.match(source, /raw\.githubusercontent\.com\/nvkelso\/natural-earth-vector\/v5\.1\.2\/geojson\/ne_10m_admin_0_countries\.geojson/);
  assert.match(source, /lmalloyds\.com\/wp-content\/uploads\/2025\/06\/JWLA-034-Saudi-Arabia\.pdf/);
  assert.match(source, /22_224/);
  assert.match(source, /1b18b7248d47e3c4db53cb2cb80be635dcca781149ec6aabfeea4bf9ce164f22/);
  assert.match(source, /3bbb5fca57b73d43ed2ab7a583ee2b7ede10d9769030854cf36eb19e332aa800/);
});

test("compact subset and three-feature artifact have canonical bytes and complete provenance", () => {
  const subsetBytes = fs.readFileSync(path.join(referenceDir, subsetName));
  const artifactBytes = fs.readFileSync(path.join(referenceDir, artifactName));
  const manifestBytes = fs.readFileSync(path.join(referenceDir, manifestName));
  const subset = JSON.parse(subsetBytes);
  const artifact = JSON.parse(artifactBytes);
  const manifest = JSON.parse(manifestBytes);
  // Python's canonical JSON bytes are the trust boundary. JavaScript JSON.stringify
  // is not equivalent for numeric spellings such as 28.0, so pin exact raw bytes.
  assert.equal(subsetBytes.length, 206_408);
  assert.equal(sha256(subsetBytes), "cb1cd8304062373c48610be14bcd6b8f63389bb66cff10a8f9e3b74727b7bef9");
  assert.equal(artifactBytes.length, 85_838);
  assert.equal(sha256(artifactBytes), "1b18b7248d47e3c4db53cb2cb80be635dcca781149ec6aabfeea4bf9ce164f22");
  assert.equal(manifestBytes.length, 4_969);
  assert.equal(sha256(manifestBytes), "3bbb5fca57b73d43ed2ab7a583ee2b7ede10d9769030854cf36eb19e332aa800");
  assert.ok(subsetBytes.length < 1_500_000, `subset is not compact: ${subsetBytes.length}`);
  assert.ok(artifactBytes.length < 150_000, `artifact exceeds budget: ${artifactBytes.length}`);
  assert.equal(subset.features.length, 4);
  assert.deepEqual(subset.features.map((feature) => feature.id), ["ne:ocean:black-sea-azov", "ne:ocean:gulf-of-guinea", "ne:ocean:caspian", "ne:admin0:iran"]);
  assert.equal(artifact.features.length, 3);
  assert.deepEqual(artifact.features.map((feature) => feature.id), ids);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.artifactSha256, sha256(artifactBytes));
  assert.equal(manifest.sourceSubsetSha256, sha256(subsetBytes));
  assert.deepEqual(manifest.sourceSha256, expectedSourceHashes);
  assert.equal(manifest.naturalEarth.version, "v5.1.2");
  assert.equal(manifest.naturalEarth.tagCommit, "f1890d9f152c896d250a77557a5751a93d494776");
  assert.match(manifest.naturalEarth.license, /public domain/i);
  assert.equal(manifest.crs.output, "EPSG:4326");
  assert.equal(manifest.crs.iranBuffer, "+proj=aeqd +lat_0=38 +lon_0=51 +datum=WGS84 +units=m +no_defs");
  assert.equal(manifest.algorithm.iranCaspianBufferMeters, 22_224);
  assert.equal(manifest.algorithm.bufferQuadSegs, 32);
  assert.equal(manifest.manualReviewRequired, true);
  assert.equal(manifest.features.length, 3);
  assert.equal(manifest.features.every((feature) => feature.contractAlertEligible === false && feature.manualReviewRequired === true), true);
  assert.match(manifest.features[0].limitations.join(" "), /inland waters.*excluded|excluded.*inland waters/i);
  assert.match(manifest.features[2].limitations.join(" "), /provisional|not authoritative/i);
});

test("precision geometries pass topology, probes, water-mask overlap, and bounded area", () => {
  const artifactPath = path.join(referenceDir, artifactName);
  const subsetPath = path.join(referenceDir, subsetName);
  const probe = String.raw`
import json, sys
from shapely.geometry import shape, Point
from shapely.ops import transform
from pyproj import Geod, Transformer
artifact=json.load(open(sys.argv[1])); subset=json.load(open(sys.argv[2]))
features={f["id"]:shape(f["geometry"]) for f in artifact["features"]}
masks={f["id"]:shape(f["geometry"]) for f in subset["features"]}
checks={
 "jwla-034:precision:black-sea-azov-marine": ([31.0,45.5],[28.8,45.2]),
 "jwla-034:precision:gulf-of-guinea-water": ([4.0,2.0],[3.4,6.6]),
 "jwla-034:precision:iran-caspian-12nm": ([49.05,38.3],[51.0,40.0]),
}
mask_ids={
 "jwla-034:precision:black-sea-azov-marine":"ne:ocean:black-sea-azov",
 "jwla-034:precision:gulf-of-guinea-water":"ne:ocean:gulf-of-guinea",
 "jwla-034:precision:iran-caspian-12nm":"ne:ocean:caspian",
}
geod=Geod(ellps="WGS84")
areas={}
for ident,(inside,outside) in checks.items():
 g=features[ident]
 assert g.is_valid and not g.is_empty, ident
 assert g.covers(Point(*inside)), (ident,"inside")
 assert not g.covers(Point(*outside)), (ident,"outside")
 # Shapely's projected intersection is transformed back to EPSG:4326 before
 # serialization. Floating overlay/round-trip noise can leave microscopic slivers;
 # this strict angular-area tolerance is far below the cartographic source precision.
 outside_mask_area=g.difference(masks[mask_ids[ident]]).area
 assert outside_mask_area < 3e-8, (ident,"outside water mask",outside_mask_area)
 area=abs(geod.geometry_area_perimeter(g)[0])/1_000_000
 assert 10_000 < area < 600_000, (ident,area)
 areas[ident]=area
print(json.dumps(areas,sort_keys=True))
`;
  const result = spawnSync("python3", ["-c", probe, artifactPath, subsetPath], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("precision derivation is deterministic from compact checked-in subsets", () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-precision-first-"));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-precision-second-"));
  try {
    for (const directory of [first, second]) fs.copyFileSync(path.join(referenceDir, subsetName), path.join(directory, subsetName));
    const run1 = runDerivation(first);
    const run2 = runDerivation(second);
    assert.equal(run1.status, 0, `${run1.stdout}\n${run1.stderr}`);
    assert.equal(run2.status, 0, `${run2.stdout}\n${run2.stderr}`);
    for (const name of [artifactName, manifestName]) assert.deepEqual(fs.readFileSync(path.join(first, name)), fs.readFileSync(path.join(second, name)), name);
    assert.deepEqual(fs.readFileSync(path.join(first, artifactName)), fs.readFileSync(path.join(referenceDir, artifactName)));
    assert.deepEqual(fs.readFileSync(path.join(first, manifestName)), fs.readFileSync(path.join(referenceDir, manifestName)));
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test("precision derivation fails closed and preserves an existing pin on corrupt subset", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-precision-fail-closed-"));
  try {
    fs.writeFileSync(path.join(directory, subsetName), '{"type":"FeatureCollection","features":[]}\n');
    const artifactSentinel = Buffer.from("existing-artifact\0");
    const manifestSentinel = Buffer.from("existing-manifest\0");
    fs.writeFileSync(path.join(directory, artifactName), artifactSentinel);
    fs.writeFileSync(path.join(directory, manifestName), manifestSentinel);
    const result = runDerivation(directory);
    assert.notEqual(result.status, 0, "corrupt source unexpectedly derived");
    assert.match(result.stderr, /hash|subset|pin|source/i);
    assert.deepEqual(fs.readFileSync(path.join(directory, artifactName)), artifactSentinel);
    assert.deepEqual(fs.readFileSync(path.join(directory, manifestName)), manifestSentinel);
    assert.deepEqual(fs.readdirSync(directory).filter((name) => /\.tmp$/.test(name)), []);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("precision pin publication recovers all three prior files after SIGKILL", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-precision-pin-kill-"));
  const journalName = ".jwla-034-precision-pin-transaction.json";
  try {
    const subsetBytes = fs.readFileSync(path.join(referenceDir, subsetName));
    const sourceInput = path.join(directory, "reviewed-source-input.geojson");
    const subsetSentinel = Buffer.from("prior-subset\0");
    const artifactSentinel = Buffer.from("prior-artifact\0");
    const manifestSentinel = Buffer.from("prior-manifest\0");
    fs.writeFileSync(sourceInput, subsetBytes);
    fs.writeFileSync(path.join(directory, subsetName), subsetSentinel);
    fs.writeFileSync(path.join(directory, artifactName), artifactSentinel);
    fs.writeFileSync(path.join(directory, manifestName), manifestSentinel);

    const killed = runDerivation(directory, ["--source-subset", sourceInput], {
      JWLA034_PRECISION_TEST_MODE: "1",
      JWLA034_PRECISION_TEST_KILL_AFTER_REPLACE: "3",
    });
    assert.equal(killed.signal, "SIGKILL", `${killed.stdout}\n${killed.stderr}`);
    assert.equal(readJson(path.join(directory, journalName)).phase, "prepared");

    const recovered = runDerivation(directory, ["--recover-only"]);
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.deepEqual(fs.readFileSync(path.join(directory, subsetName)), subsetSentinel);
    assert.deepEqual(fs.readFileSync(path.join(directory, artifactName)), artifactSentinel);
    assert.deepEqual(fs.readFileSync(path.join(directory, manifestName)), manifestSentinel);
    assert.equal(fs.existsSync(path.join(directory, journalName)), false);
    assert.deepEqual(fs.readdirSync(directory).filter((name) => /\.(stage|backup)$/.test(name)), []);

    const republished = runDerivation(directory, ["--source-subset", sourceInput]);
    assert.equal(republished.status, 0, `${republished.stdout}\n${republished.stderr}`);
    for (const name of [subsetName, artifactName, manifestName]) {
      assert.deepEqual(fs.readFileSync(path.join(directory, name)), fs.readFileSync(path.join(referenceDir, name)), name);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Node generator pins independent precision artifact and provenance hashes and preserves three geometries", () => {
  const source = fs.readFileSync(path.join(backendDir, "generate_jwla034_reference.mjs"), "utf8");
  const artifactBytes = fs.readFileSync(path.join(referenceDir, artifactName));
  const manifestBytes = fs.readFileSync(path.join(referenceDir, manifestName));
  const artifact = JSON.parse(artifactBytes);
  const generated = readJson(path.join(rootDir, "frontend", "public", "risk-areas", generatedName));
  assert.match(source, new RegExp(sha256(artifactBytes)));
  assert.match(source, new RegExp(sha256(manifestBytes)));
  assert.notEqual(sha256(artifactBytes), sha256(manifestBytes));
  assert.equal(generated.features.length, 3);
  assert.deepEqual(generated.features.map((feature) => feature.id), ids);
  assert.deepEqual(generated.features.map((feature) => feature.geometry), artifact.features.map((feature) => feature.geometry));
  assert.deepEqual(generated.features.map((feature) => feature.properties.geometryStatus), [
    "derived-marine-reference-inland-waters-excluded",
    "derived-water-only-reference",
    "provisional-derived-12nm-reference",
  ]);
  for (const feature of generated.features) {
    assert.equal(feature.properties.contractAlertEligible, false);
    assert.equal(feature.properties.manualReviewRequired, true);
    assert.equal(feature.properties.monitoringMode, "reference-only");
    assert.equal(feature.properties.sourceArtifactSha256, sha256(artifactBytes));
    assert.equal(feature.properties.sourceManifestSha256, sha256(manifestBytes));
  }
});

test("Node generator rejects either precision artifact or manifest mutation without replacing seven outputs", () => {
  for (const corruptName of [artifactName, manifestName]) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-precision-node-fail-"));
    try {
      const { tempBackend, tempReference, tempOutput } = fixtureCopy(tempRoot);
      fs.appendFileSync(path.join(tempReference, corruptName), " ");
      const names = [
        "jwla-034-reference.geojson", "jwla-034-coastal-waters.geojson", "jwla-034-amendments.geojson",
        "jwla-034-countries.geojson", "jwla-034-installations.geojson", "jwla-034-coastal-waters-provisional.geojson", generatedName,
      ];
      for (const name of names) fs.writeFileSync(path.join(tempOutput, name), `sentinel:${name}`);
      const result = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], { cwd: tempBackend, encoding: "utf8", timeout: 30_000 });
      assert.notEqual(result.status, 0, `${corruptName} unexpectedly published`);
      assert.match(result.stderr, /precision|manifest|artifact|hash/i);
      for (const name of names) assert.equal(fs.readFileSync(path.join(tempOutput, name), "utf8"), `sentinel:${name}`);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("journal recovery accepts exact v1=5, v2=6, and new v3=7 schemas", () => {
  const schemas = new Map([
    [1, ["jwla-034-reference.geojson", "jwla-034-coastal-waters.geojson", "jwla-034-amendments.geojson", "jwla-034-countries.geojson", "jwla-034-installations.geojson"]],
    [2, ["jwla-034-reference.geojson", "jwla-034-coastal-waters.geojson", "jwla-034-amendments.geojson", "jwla-034-countries.geojson", "jwla-034-installations.geojson", "jwla-034-coastal-waters-provisional.geojson"]],
    [3, ["jwla-034-reference.geojson", "jwla-034-coastal-waters.geojson", "jwla-034-amendments.geojson", "jwla-034-countries.geojson", "jwla-034-installations.geojson", "jwla-034-coastal-waters-provisional.geojson", generatedName]],
  ]);
  for (const [version, names] of schemas) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `jwla-journal-v${version}-`));
    try {
      const { tempBackend, tempOutput } = fixtureCopy(tempRoot);
      const token = `123-00000000-0000-4000-8000-00000000000${version}`;
      const entries = transactionEntries(names, token);
      for (const entry of entries) {
        fs.writeFileSync(path.join(tempOutput, entry.finalName), `v${version}-final`);
        fs.writeFileSync(path.join(tempOutput, entry.stageName), `v${version}-stage`);
      }
      fs.writeFileSync(path.join(tempOutput, ".jwla-034-generation-transaction.json"), JSON.stringify({ version, phase: "committed", token, entries }));
      fs.appendFileSync(path.join(tempBackend, "reference-data", manifestName), " ");
      const result = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], { cwd: tempBackend, encoding: "utf8", timeout: 30_000 });
      assert.notEqual(result.status, 0, `v${version} did not proceed to input validation`);
      assert.match(result.stderr, /precision|manifest|hash/i);
      assert.equal(fs.existsSync(path.join(tempOutput, ".jwla-034-generation-transaction.json")), false);
      for (const entry of entries) assert.equal(fs.existsSync(path.join(tempOutput, entry.stageName)), false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
});

test("new publication journal is v3 and transactionally protects all seven outputs", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jwla-journal-v3-kill-"));
  try {
    const { tempBackend, tempOutput } = fixtureCopy(tempRoot);
    const killed = spawnSync(process.execPath, ["generate_jwla034_reference.mjs"], {
      cwd: tempBackend, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, NODE_ENV: "test", JWLA034_TEST_SIGKILL_AFTER_REPLACEMENTS: "1" },
    });
    assert.equal(killed.signal, "SIGKILL", `${killed.stdout}\n${killed.stderr}`);
    const journal = readJson(path.join(tempOutput, ".jwla-034-generation-transaction.json"));
    assert.equal(journal.version, 3);
    assert.equal(journal.entries.length, 7);
    assert.deepEqual(journal.entries.map((entry) => entry.name), [
      "jwla-034-reference.geojson", "jwla-034-coastal-waters.geojson", "jwla-034-amendments.geojson",
      "jwla-034-countries.geojson", "jwla-034-installations.geojson", "jwla-034-coastal-waters-provisional.geojson", generatedName,
    ]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("forbidden backend alert inputs and global generator remain byte-identical to HEAD", () => {
  const expected = new Map([
    ["backend/src/services/geofenceChecker.js", "753ba3d74b44e63a08064c97ef7228621bcbf0a31bb04906d150259dcdb09d83"],
    ["frontend/public/war-risk-zone.geojson", "a8ed1684db314eb1161957aa14f18c6129036ff47bf10a53ee619046fe89e56c"],
    ["frontend/public/12nm_bounds.geojson", "0a70346fac027f6bf4bb53e68a55e32c9d931b99389e7afd990e0fe6768a0f3b"],
    ["frontend/public/war-risk-zone-global.geojson", "58a9dedb2fac16a6008208468fba76924f3db52fc0eb022044b62425938ab94d"],
    ["backend/generate_global_zones.mjs", "8d7f535b38c7482862ae067f2dda29f8beaec58230eb77b0b7e20c3e60fc8fec"],
  ]);
  for (const [relativePath, digest] of expected) assert.equal(sha256(fs.readFileSync(path.join(rootDir, relativePath))), digest, relativePath);
});
