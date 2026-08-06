import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as turf from "@turf/turf";
import {
  JWLA_REFERENCE,
  RISK_AREA_SECTIONS,
  allRiskAreaItems,
  applyItemVisibility,
  applySectionAppearance,
  getCalendarStatus,
  isItemVisible,
  resetSectionAppearance,
  shouldLoadSectionLayers,
} from "./riskAreaCatalog.js";

const publicPath = (name) => new URL(`../../public/risk-areas/${name}`, import.meta.url);
const readGeoJSON = (name) => JSON.parse(fs.readFileSync(publicPath(name), "utf8"));

const bySection = (id) => RISK_AREA_SECTIONS.find((section) => section.id === id);

function featureByName(collection, name) {
  return collection.features.find((feature) => feature.properties?.name === name);
}

test("catalog presents JWLA-033 as the visible baseline and JWLA-034 as a distinct amendment", () => {
  assert.equal(JWLA_REFERENCE.circular, "JWLA-034");
  assert.equal(JWLA_REFERENCE.previousCircular, "JWLA-033");
  assert.equal(JWLA_REFERENCE.publishedAt, "2026-07-29");
  assert.match(JWLA_REFERENCE.sourceUrl, /lmalloyds\.com\/.*JWLA-034/);
  assert.equal(JWLA_REFERENCE.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");

  const amendment = bySection("jwc-034-amendment");
  const baseline = bySection("contract-alerts");
  assert.equal(amendment.items.length, 1);
  assert.equal(amendment.items[0].layerKeys[0], "JWLA 034 Amendment - Red Sea 18N to 25.5N");
  assert.equal(amendment.items[0].defaultVisible, true);
  assert.equal(amendment.color, "#facc15");
  assert.equal(amendment.items[0].color, "#facc15");
  assert.equal(baseline.items.length, 22);
  assert.equal(baseline.defaultOpen, false);
  assert.equal(baseline.color, "#ef4444");
  assert.ok(baseline.items.every((areaItem) => areaItem.defaultVisible === true));
  assert.ok(baseline.items.every((areaItem) => areaItem.color === "#ef4444"));
  assert.match(baseline.label, /JWLA-033 Baseline/);

  const areaPanelSource = fs.readFileSync(new URL("./AreaPanel.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(areaPanelSource, /색은 033 기준\/현재 backend 경보경계/);

  assert.equal(bySection("jwc-installations"), undefined);
  assert.equal(bySection("jwc-countries"), undefined);
  assert.equal(bySection("ibf-itf").items.length, 11);
  assert.equal(bySection("ibf-itf").countLabel, "10 active · 1 withdrawn");
  assert.equal(bySection("iwl").items.length, 13);

  const labels = allRiskAreaItems().map((areaItem) => areaItem.label);
  assert.ok(labels.some((label) => label.includes("Saudi Arabia")));
  assert.ok(labels.some((label) => label.includes("Eritrea")));
  assert.ok(!labels.includes("Pakistan"));
  assert.ok(!labels.includes("Mozambique (N.)"));
});

test("IBF/ITF current designations and IWL calendar status do not copy the stale JWLA.ai panel", () => {
  const crewItems = bySection("ibf-itf").items;
  assert.equal(crewItems.filter((item) => item.designationStatus === "active").length, 10);
  assert.ok(crewItems.some((item) => item.id === "ibf-yemen-mainland-12nm-woa"));
  assert.ok(crewItems.some((item) => item.id === "ibf-ukraine-ports-woa"));
  assert.ok(crewItems.some((item) => item.id === "ibf-israel-lebanon-level2-erz"));
  const withdrawn = crewItems.find((item) => item.id === "ibf-gulf-guinea-erz");
  assert.equal(withdrawn.designationStatus, "withdrawn");
  assert.equal(withdrawn.dataStatus, "withdrawn");
  assert.match(withdrawn.sourceUrl, /itfseafarers\.org/);

  const iwlItems = bySection("iwl").items;
  assert.equal(iwlItems.filter((item) => item.ruleType === "YEAR_ROUND").length, 7);
  assert.equal(iwlItems.filter((item) => item.ruleType === "SEASONAL").length, 6);
  const asOf = new Date("2026-07-30T00:00:00Z");
  assert.equal(iwlItems.filter((item) => getCalendarStatus(item, asOf) === "ACTIVE").length, 7);
  assert.equal(iwlItems.filter((item) => getCalendarStatus(item, asOf) === "INACTIVE").length, 6);
});

test("catalog identifiers and layer keys are unique", () => {
  const items = allRiskAreaItems();
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);

  const layerKeys = items.flatMap((item) => item.layerKeys || []);
  assert.equal(new Set(layerKeys).size, layerKeys.length);
});

test("only mapped layers can be toggled and compound items update every layer key", () => {
  const defined = bySection("jwc-034-amendment").items[0];
  assert.ok(defined.layerKeys.length > 0);
  const on = applyItemVisibility({}, defined, true);
  assert.equal(isItemVisible(on, defined), true);
  for (const key of defined.layerKeys) assert.equal(on[key].visible, true);

  const off = applyItemVisibility(on, defined, false);
  assert.equal(isItemVisible(off, defined), false);

  const pending = bySection("ibf-itf").items[0];
  assert.deepEqual(applyItemVisibility(off, pending, true), off);
});

test("section appearance updates every ready layer while preserving visibility", () => {
  const baseline = bySection("contract-alerts");
  const firstKey = baseline.items[0].layerKeys[0];
  const secondKey = baseline.items[1].layerKeys[0];
  const initial = {
    [firstKey]: { visible: false, color: "#123456", opacity: 0.1 },
    [secondKey]: { visible: true, color: "#654321", opacity: 0.2 },
  };

  const updated = applySectionAppearance(initial, baseline, {
    color: "#ef4444",
    opacity: 0.18,
  });

  for (const areaItem of baseline.items) {
    for (const layerKey of areaItem.layerKeys) {
      assert.equal(updated[layerKey].color, "#ef4444");
      assert.equal(updated[layerKey].opacity, 0.18);
    }
  }
  assert.equal(updated[firstKey].visible, false);
  assert.equal(updated[secondKey].visible, true);
});

test("section reset restores each item default appearance while preserving visibility", () => {
  const section = {
    items: [
      { dataStatus: "ready", layerKeys: ["a"], color: "#ef4444", opacity: 0.08 },
      { dataStatus: "ready", layerKeys: ["b"], color: "#facc15", opacity: 0.22 },
    ],
  };
  const initial = {
    a: { visible: false, color: "#111111", opacity: 0.3, custom: "keep-a" },
    b: { visible: true, color: "#222222", opacity: 0.4, custom: "keep-b" },
  };

  const reset = resetSectionAppearance(initial, section);

  assert.deepEqual(reset.a, {
    visible: false, color: "#ef4444", opacity: 0.08, custom: "keep-a",
  });
  assert.deepEqual(reset.b, {
    visible: true, color: "#facc15", opacity: 0.22, custom: "keep-b",
  });
});

test("risk settings modal has a bounded viewport height and an internal scroll region", () => {
  const modalSource = fs.readFileSync(new URL("../components/ZoneSettingsPanel.jsx", import.meta.url), "utf8");
  const areaPanelSource = fs.readFileSync(new URL("./AreaPanel.jsx", import.meta.url), "utf8");
  assert.match(modalSource, /h-\[88dvh\]/);
  assert.match(areaPanelSource, /data-testid="risk-settings-scroll"/);
  assert.match(areaPanelSource, /overflow-y-auto/);
});

test("legacy contract-alert catalog stays aligned with the backend geofence inputs", () => {
  const filenames = ["war-risk-zone.geojson", "12nm_bounds.geojson", "war-risk-zone-global.geojson"];
  const backendSource = fs.readFileSync(new URL("../../../backend/src/services/geofenceChecker.js", import.meta.url), "utf8");
  for (const filename of filenames) assert.match(backendSource, new RegExp(filename.replaceAll(".", "\\.")));

  const expectedNames = new Set(filenames.flatMap((filename) => (
    JSON.parse(fs.readFileSync(new URL(`../../public/${filename}`, import.meta.url), "utf8"))
      .features.map((feature) => feature.properties?.name)
  )));
  const catalogNames = new Set(bySection("contract-alerts").items.flatMap((item) => item.layerKeys));
  assert.deepEqual(catalogNames, expectedNames);
  assert.equal(shouldLoadSectionLayers("contract-alerts", {}, null), true);
  assert.equal(shouldLoadSectionLayers("contract-alerts", {}, [...catalogNames][0]), true);

  const israel = bySection("contract-alerts").items.find((areaItem) => (
    areaItem.layerKeys.includes("Israel 12NM Territorial Waters")
  ));
  assert.ok(israel);
  assert.equal(isItemVisible({}, israel), true);
  assert.equal(isItemVisible({
    "Israel 12NM Territorial Waters": { visible: false },
  }, israel), false);
});

test("JWLA-034 source GeoJSON remains valid and the UI amendment asset contains only the northward delta", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const countries = readGeoJSON("jwla-034-countries.geojson");
  const amendments = readGeoJSON("jwla-034-amendments.geojson");
  assert.equal(areas.features.length, 10);
  assert.equal(countries.features.length, 22);
  assert.equal(amendments.features.length, 1);

  const amendmentSectionKeys = new Set(bySection("jwc-034-amendment").items.flatMap((areaItem) => areaItem.layerKeys));
  const amendmentFeatureNames = new Set(amendments.features.map((feature) => feature.properties?.name));
  assert.deepEqual(amendmentFeatureNames, amendmentSectionKeys);

  const allFeatures = [...areas.features, ...countries.features, ...amendments.features];
  assert.equal(new Set(allFeatures.map((feature) => feature.id)).size, allFeatures.length);
  for (const feature of allFeatures) {
    assert.ok(feature.id);
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
    assert.equal(feature.properties?.contractAlertEligible, false);
    assert.equal(feature.properties?.circular, "JWLA-034");
    const expectedSourceSha = feature.properties?.scope === "named-country-coastal-waters"
      ? "00b007a2a76df5b7a59fc8349c0184d1f561da12c3cec5f5acf65d5f10ad4a6f"
      : "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9";
    assert.equal(feature.properties?.sourceSha256, expectedSourceSha);
    assert.ok(feature.properties?.sourceUrl);
  }

  const delta = featureByName(amendments, "JWLA 034 Amendment - Red Sea 18N to 25.5N");
  assert.ok(delta);
  assert.equal(delta.properties?.mapKind, "version-amendment");
  assert.equal(delta.properties?.previousCircular, "JWLA-033");
  assert.equal(delta.properties?.changeType, "northward-extension");
  assert.equal(delta.properties?.southLimit, 18);
  assert.equal(delta.properties?.northLimit, 25.5);
  assert.equal(delta.properties?.excludesEgyptTerritorialWaters, true);
  const deltaBounds = turf.bbox(delta);
  assert.ok(deltaBounds[1] >= 18, `delta extends south of 18N: ${deltaBounds[1]}`);
  assert.equal(deltaBounds[3], 25.5);
  assert.equal(turf.booleanPointInPolygon(turf.point([37.0, 24.5]), delta), true);
  assert.equal(turf.booleanPointInPolygon(turf.point([35.25, 24.5]), delta), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([40.0, 17.0]), delta), false);
});

test("the full JWLA-034 reference still records the amended limit and Cabo includes Tanzania", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const addedArea = featureByName(areas, "JWLA 034 - Red Sea Added Area 18N to 25.5N");
  const cabo = featureByName(areas, "JWLA 034 - Cabo Delgado");
  assert.ok(addedArea);
  assert.ok(cabo);

  assert.equal(addedArea.properties?.redSeaNorthLimit, 25.5);
  assert.equal(addedArea.properties?.excludesEgyptTerritorialWaters, true);
  assert.equal(turf.booleanPointInPolygon(turf.point([35.25, 24.5]), addedArea), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([37.0, 24.5]), addedArea), true);
  assert.equal(turf.booleanPointInPolygon(turf.point([40.48, -10.25]), cabo), true);
});
