import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as turf from "@turf/turf";
import {
  JWLA_REFERENCE,
  RISK_AREA_SECTIONS,
  allRiskAreaItems,
  applyItemVisibility,
  getCalendarStatus,
  isItemVisible,
  shouldLoadSectionLayers,
} from "./riskAreaCatalog.js";

const publicPath = (name) => new URL(`../../public/risk-areas/${name}`, import.meta.url);
const readGeoJSON = (name) => JSON.parse(fs.readFileSync(publicPath(name), "utf8"));

const bySection = (id) => RISK_AREA_SECTIONS.find((section) => section.id === id);

function featureByName(collection, name) {
  return collection.features.find((feature) => feature.properties?.name === name);
}

test("JWLA-034 catalog reflects the official LMA structure and changes", () => {
  assert.equal(JWLA_REFERENCE.circular, "JWLA-034");
  assert.equal(JWLA_REFERENCE.publishedAt, "2026-07-29");
  assert.match(JWLA_REFERENCE.sourceUrl, /lmalloyds\.com\/.*JWLA-034/);
  assert.equal(JWLA_REFERENCE.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");

  assert.equal(bySection("jwc-defined-waters").items.length, 4);
  assert.equal(bySection("jwc-installations").items.length, 2);
  assert.equal(bySection("jwc-countries").items.length, 23);
  assert.equal(bySection("contract-alerts").items.length, 22);
  assert.equal(bySection("ibf-itf").items.length, 11);
  assert.equal(bySection("ibf-itf").countLabel, "10 active · 1 withdrawn");
  assert.equal(bySection("iwl").items.length, 13);

  const labels = allRiskAreaItems().map((item) => item.label);
  assert.ok(labels.includes("Saudi Arabia"));
  assert.ok(labels.includes("Eritrea"));
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
  const defined = bySection("jwc-defined-waters").items[0];
  assert.ok(defined.layerKeys.length > 0);
  const on = applyItemVisibility({}, defined, true);
  assert.equal(isItemVisible(on, defined), true);
  for (const key of defined.layerKeys) assert.equal(on[key].visible, true);

  const off = applyItemVisibility(on, defined, false);
  assert.equal(isItemVisible(off, defined), false);

  const pending = bySection("ibf-itf").items[0];
  assert.deepEqual(applyItemVisibility(off, pending, true), off);
});

test("hidden country reference data loads only when a country is shown or focused", () => {
  const country = bySection("jwc-countries").items[0];
  assert.equal(shouldLoadSectionLayers("jwc-countries", {}, null), false);
  assert.equal(shouldLoadSectionLayers("jwc-countries", {}, country.layerKeys[0]), true);
  const focusedSettings = applyItemVisibility({}, country, true);
  assert.equal(isItemVisible(focusedSettings, country), true);
  assert.equal(shouldLoadSectionLayers("jwc-countries", focusedSettings, null), true);
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
  assert.equal(shouldLoadSectionLayers("contract-alerts", {}, null), false);
  assert.equal(shouldLoadSectionLayers("contract-alerts", {}, [...catalogNames][0]), true);
});

test("JWLA-034 reference GeoJSON matches the catalog and is geometrically valid", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const countries = readGeoJSON("jwla-034-countries.geojson");
  assert.equal(areas.features.length, 6);
  assert.equal(countries.features.length, 23);

  const mappedKeys = new Set(
    RISK_AREA_SECTIONS
      .filter((section) => section.id.startsWith("jwc-"))
      .flatMap((section) => section.items)
      .flatMap((item) => item.layerKeys || []),
  );
  const featureNames = new Set([...areas.features, ...countries.features].map((f) => f.properties?.name));
  assert.deepEqual(featureNames, mappedKeys);

  const allFeatures = [...areas.features, ...countries.features];
  assert.equal(new Set(allFeatures.map((feature) => feature.id)).size, allFeatures.length);
  for (const feature of allFeatures) {
    assert.ok(feature.id);
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
    assert.equal(feature.properties?.mapKind, "current-reference");
    assert.equal(feature.properties?.contractAlertEligible, false);
    assert.equal(feature.properties?.circular, "JWLA-034");
    assert.equal(feature.properties?.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");
    assert.ok(feature.properties?.sourceUrl);
  }
});

test("the amended combined waters record 25.5N, exclude Egypt coastal waters, and Cabo includes Tanzania", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const main = featureByName(areas, "JWLA 034 - Combined Middle East and Southern Red Sea Waters");
  const cabo = featureByName(areas, "JWLA 034 - Cabo Delgado");
  assert.ok(main);
  assert.ok(cabo);

  assert.equal(main.properties?.redSeaNorthLimit, 25.5);
  assert.equal(main.properties?.excludesEgyptTerritorialWaters, true);
  assert.equal(turf.booleanPointInPolygon(turf.point([35.25, 24.5]), main), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([37.0, 24.5]), main), true);
  assert.equal(turf.booleanPointInPolygon(turf.point([40.48, -10.25]), cabo), true);
});
