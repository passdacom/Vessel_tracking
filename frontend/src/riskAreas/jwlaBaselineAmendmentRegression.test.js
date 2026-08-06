import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RISK_AREA_SECTIONS,
  getLayerDefaults,
  migrateRiskAreaSettings,
} from "./riskAreaCatalog.js";

const bySection = (id) => RISK_AREA_SECTIONS.find((section) => section.id === id);

test("default JWC map restores every JWLA-033 baseline polygon and overlays only the JWLA-034 added area", () => {
  const baseline = bySection("contract-alerts");
  const amendment = bySection("jwc-034-amendment");

  assert.ok(baseline, "JWLA-033 baseline section must be user-visible");
  assert.equal(baseline.items.length, 22);
  assert.ok(baseline.items.every((areaItem) => areaItem.defaultVisible));
  assert.ok(baseline.items.every((areaItem) => areaItem.color === "#ef4444"));
  assert.ok(baseline.items.some((areaItem) => areaItem.layerKeys.includes("Israel 12NM Territorial Waters")));
  assert.ok(baseline.items.some((areaItem) => areaItem.layerKeys.includes("Lebanon 12NM Territorial Waters")));
  assert.ok(baseline.items.some((areaItem) => areaItem.layerKeys.includes("Saudi Arabia 12NM Territorial Waters (Red Sea)")));

  assert.ok(amendment, "JWLA-034 added-area section must be user-visible");
  assert.equal(amendment.items.length, 1);
  assert.equal(amendment.items[0].layerKeys[0], "JWLA 034 Amendment - Red Sea 18N to 25.5N");
  assert.equal(amendment.items[0].defaultVisible, true);
  assert.equal(amendment.items[0].color, "#facc15");

  assert.equal(bySection("jwla-034"), undefined, "the ten replacement polygons must not be the default map");
  assert.equal(bySection("jwc-countries"), undefined, "replacement named-country polygons must not remain in the map panel");
  assert.equal(bySection("jwc-installations"), undefined, "EEZ installation context polygons must not remain in the map panel");
});

test("baseline and amendment defaults resolve to one color per layer family", () => {
  assert.deepEqual(getLayerDefaults("JWC War Risk Zone - Persian Gulf"), {
    visible: true,
    color: "#ef4444",
    opacity: 0.08,
  });
  assert.deepEqual(getLayerDefaults("JWLA 034 Amendment - Red Sea 18N to 25.5N"), {
    visible: true,
    color: "#facc15",
    opacity: 0.22,
  });
});

test("one-time migration replaces the broken 034 defaults with uniform baseline plus added-area defaults", () => {
  const legacy = {
    __jwlaCatalogVersion: 3,
    "JWC War Risk Zone - Persian Gulf": { visible: false, color: "#123456", opacity: 0.3 },
    "JWLA 034 - Persian Gulf": { visible: true, color: "#dc2626", opacity: 0.15 },
  };
  const migrated = migrateRiskAreaSettings(legacy);
  const baseline = bySection("contract-alerts");
  for (const areaItem of baseline.items) {
    assert.deepEqual(migrated[areaItem.layerKeys[0]], {
      visible: true,
      color: "#ef4444",
      opacity: 0.08,
    });
  }
  assert.deepEqual(migrated["JWLA 034 Amendment - Red Sea 18N to 25.5N"], {
    visible: true,
    color: "#facc15",
    opacity: 0.22,
  });
  assert.equal(migrateRiskAreaSettings(migrated), migrated);
});

test("map renderer loads the JWLA-033 source assets and the delta asset, not replacement named-country polygons", () => {
  const source = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(source, /war-risk-zone\.geojson/);
  assert.match(source, /12nm_bounds\.geojson/);
  assert.match(source, /war-risk-zone-global\.geojson/);
  assert.match(source, /jwla-034-amendments\.geojson/);
  assert.doesNotMatch(source, /jwla-034-coastal-waters(?:-provisional)?\.geojson/);
  assert.doesNotMatch(source, /jwla-034-reference\.geojson/);
  assert.doesNotMatch(source, /jwla-034-countries\.geojson/);
});
