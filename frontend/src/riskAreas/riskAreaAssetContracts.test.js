import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as turf from "@turf/turf";
import {
  JWLA_REFERENCE,
  JWC_034_PRECISION_REFERENCES,
  buildFeaturePopupContent,
  getComparisonLayerKeys,
} from "./riskAreaCatalog.js";

const publicFile = (name) => new URL(`../../public/${name}`, import.meta.url);
const riskFile = (name) => new URL(`../../public/risk-areas/${name}`, import.meta.url);
const read = (url) => JSON.parse(fs.readFileSync(url, "utf8"));
const featureByName = (collection, name) => collection.features.find((feature) => feature.properties?.name === name);

test("all seven JWLA-034 display assets retain unique IDs, polygon schema and provenance", () => {
  const assets = [
    "jwla-034-reference.geojson",
    "jwla-034-coastal-waters.geojson",
    "jwla-034-coastal-waters-provisional.geojson",
    "jwla-034-precision-references.geojson",
    "jwla-034-countries.geojson",
    "jwla-034-amendments.geojson",
    "jwla-034-installations.geojson",
  ].map((name) => read(riskFile(name)));
  const features = assets.flatMap(({ features: entries }) => entries);

  assert.equal(new Set(features.map(({ id }) => id)).size, features.length);
  for (const feature of features) {
    assert.ok(feature.id);
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
    assert.equal(feature.properties?.circular, "JWLA-034");
    assert.equal(feature.properties?.contractAlertEligible, false);
    assert.match(feature.properties?.sourceUrl || "", /^https:\/\//);
    const documentHash = feature.properties?.sourceDocumentSha256 || feature.properties?.sourceSha256;
    if (feature.properties?.scope !== "named-country-coastal-waters") {
      assert.equal(documentHash, JWLA_REFERENCE.sourceSha256);
    }
  }
});

test("JWLA-034 amendment remains only the exact 18N to 25.5N northward delta", () => {
  const amendments = read(riskFile("jwla-034-amendments.geojson"));
  assert.equal(amendments.features.length, 1);
  const delta = featureByName(amendments, "JWLA 034 Amendment - Red Sea 18N to 25.5N");
  assert.ok(delta);
  assert.equal(delta.properties?.mapKind, "version-amendment");
  assert.equal(delta.properties?.previousCircular, "JWLA-033");
  assert.equal(delta.properties?.changeType, "northward-extension");
  assert.equal(delta.properties?.southLimit, 18);
  assert.equal(delta.properties?.northLimit, 25.5);
  assert.equal(delta.properties?.excludesEgyptTerritorialWaters, true);
  const bounds = turf.bbox(delta);
  assert.ok(bounds[1] >= 18, `delta extends south of 18N: ${bounds[1]}`);
  assert.equal(bounds[3], 25.5);
  assert.equal(turf.booleanPointInPolygon(turf.point([37.0, 24.5]), delta), true);
  assert.equal(turf.booleanPointInPolygon(turf.point([35.25, 24.5]), delta), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([40.0, 17.0]), delta), false);
});

test("comparison catalog exactly matches the three backend geofence inputs", () => {
  const filenames = ["war-risk-zone.geojson", "12nm_bounds.geojson", "war-risk-zone-global.geojson"];
  const backendSource = fs.readFileSync(new URL("../../../backend/src/services/geofenceChecker.js", import.meta.url), "utf8");
  for (const filename of filenames) assert.match(backendSource, new RegExp(filename.replaceAll(".", "\\.")));
  const expected = filenames.flatMap((filename) => read(publicFile(filename)).features.map((feature) => feature.properties?.name)).sort();
  assert.deepEqual(getComparisonLayerKeys().sort(), expected);
});

test("Black Sea baseline excludes Georgian waters and retains official source metadata", () => {
  const global = read(publicFile("war-risk-zone-global.geojson"));
  const blackSea = featureByName(global, "JWLA 033 - Black Sea & Sea of Azov");
  const bounds = turf.bbox(blackSea);
  assert.ok(bounds[1] >= 43.38);
  assert.equal(turf.booleanPointInPolygon(turf.point([41.4, 41.7]), blackSea), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([39.8, 43.5]), blackSea), true);
  assert.match(blackSea.properties?.sourceDocument || "", /JWLA-033.*JWLA-034/);
  assert.equal(blackSea.properties?.sourceSha256, JWLA_REFERENCE.sourceSha256);
});

test("Venezuela and Guyana source EEZs and display assets stay manual installation context", () => {
  const global = read(publicFile("war-risk-zone-global.geojson"));
  const installations = read(riskFile("jwla-034-installations.geojson"));
  for (const [legacyName, displayName, mrgid] of [
    ["JWLA 033 - Venezuela (Offshore EEZ)", "JWLA 034 - Venezuela Offshore Installation Reference", 8433],
    ["JWLA 033 - Guyana (Offshore EEZ)", "JWLA 034 - Guyana Offshore Installation Reference", 8460],
  ]) {
    const legacy = featureByName(global, legacyName);
    assert.equal(legacy.properties?.geometryRole, "installation-context-only");
    assert.equal(legacy.properties?.detectionMode, "facility-visit-manual-review");
    assert.equal(legacy.properties?.manualReviewRequired, true);
    assert.equal(legacy.properties?.marineRegionsMrgid, mrgid);
    assert.match(legacy.properties?.warning || "", /transit/i);

    const display = featureByName(installations, displayName);
    assert.equal(display.properties?.scope, "installation-context-only");
    assert.equal(display.properties?.monitoringMode, "reference-only");
    assert.equal(display.properties?.manualReviewRequired, true);
    assert.equal(display.properties?.marineRegionsMrgid, mrgid);
  }
});

test("precision artifact remains exact and auditable while integrated as item status", () => {
  const output = read(riskFile("jwla-034-precision-references.geojson"));
  const ready = JWC_034_PRECISION_REFERENCES.filter(({ dataStatus }) => dataStatus === "ready");
  assert.deepEqual(output.features.map(({ id }) => id), [
    "jwla-034:precision:black-sea-azov-marine",
    "jwla-034:precision:gulf-of-guinea-water",
    "jwla-034:precision:iran-caspian-12nm",
  ]);
  assert.deepEqual(output.features.map((feature) => feature.properties?.name), ready.map((item) => item.layerKeys[0]));
  assert.ok(output.features.every((feature) => feature.properties?.mapKind === "precision-reference-display-only"));
  assert.ok(output.features.every((feature) => feature.properties?.reviewStatus === "manual-review-display-only"));
  assert.ok(output.features.every((feature) => feature.properties?.manualReviewRequired === true));
  assert.ok(output.features.every((feature) => feature.properties?.naturalEarthVersion === "v5.1.2"));
  assert.ok(output.features.every((feature) => feature.properties?.licenseUrl === "https://www.naturalearthdata.com/about/terms-of-use/"));
});

test("popup blocks data/javascript URLs and escapes source and license text", () => {
  const hostile = buildFeaturePopupContent({
    properties: {
      name: '<img src=x onerror="alert(1)">',
      attribution: "<script>alert(1)</script>",
      sourceUrl: "javascript:alert(1)",
      license: 'CC BY 4.0" onclick="alert(1)',
      licenseUrl: "data:text/html,<script>alert(1)</script>",
    },
  });
  assert.doesNotMatch(hostile, /<img|<script|href="(?:javascript:|data:text\/html)/i);
  assert.match(hostile, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(hostile, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
