import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as turf from "@turf/turf";
import * as riskAreaCatalog from "./riskAreaCatalog.js";
import {
  JWLA_REFERENCE,
  RISK_AREA_SECTIONS,
  allRiskAreaItems,
  applyItemVisibility,
  applySectionAppearance,
  getCalendarStatus,
  getFeatureBounds,
  isItemVisible,
  migrateRiskAreaSettings,
  planCoastalLoadRequest,
  resetSectionAppearance,
  shouldLoadSectionLayers,
} from "./riskAreaCatalog.js";

const publicPath = (name) => new URL(`../../public/risk-areas/${name}`, import.meta.url);
const readGeoJSON = (name) => JSON.parse(fs.readFileSync(publicPath(name), "utf8"));

const bySection = (id) => RISK_AREA_SECTIONS.find((section) => section.id === id);

function featureByName(collection, name) {
  return collection.features.find((feature) => feature.properties?.name === name);
}

test("catalog presents current JWLA-034 defined waters by default and keeps version comparison optional", () => {
  assert.equal(JWLA_REFERENCE.circular, "JWLA-034");
  assert.equal(JWLA_REFERENCE.previousCircular, "JWLA-033");
  assert.equal(JWLA_REFERENCE.publishedAt, "2026-07-29");
  assert.match(JWLA_REFERENCE.sourceUrl, /lmalloyds\.com\/.*JWLA-034/);
  assert.equal(JWLA_REFERENCE.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");

  const current = bySection("jwc-034-current");
  const amendment = bySection("jwc-034-amendment");
  const baseline = bySection("contract-alerts");
  assert.deepEqual(current.items.map((areaItem) => areaItem.layerKeys[0]), [
    "JWLA 034 - Combined Middle East and Southern Red Sea Waters",
    "JWLA 034 - Black Sea & Sea of Azov",
    "JWLA 034 - Gulf of Guinea",
    "JWLA 034 - Cabo Delgado",
    "JWLA 034 Coastal Waters - Syria 12NM",
    "JWLA 034 Coastal Waters - Russia 12NM",
  ]);
  assert.ok(current.items.slice(0, 4).every((areaItem) => areaItem.defaultVisible === true));
  assert.ok(current.items.slice(4).every((areaItem) => areaItem.defaultVisible === false));
  assert.ok(current.items.slice(4).every((areaItem) => areaItem.badge === "HIGH-DETAIL"));
  assert.ok(current.items.slice(4).every((areaItem) => /verified high-detail optional reference/i.test(areaItem.note)));
  assert.equal(current.countLabel, "4 defined waters · 2 verified coastal references");
  assert.equal(amendment.items.length, 1);
  assert.equal(amendment.items[0].layerKeys[0], "JWLA 034 Amendment - Red Sea 18N to 25.5N");
  assert.equal(amendment.items[0].defaultVisible, false);
  assert.equal(amendment.color, "#facc15");
  assert.equal(amendment.items[0].color, "#facc15");
  assert.equal(baseline.items.length, 22);
  assert.equal(baseline.defaultOpen, false);
  assert.equal(baseline.color, "#ef4444");
  assert.ok(baseline.items.every((areaItem) => areaItem.defaultVisible === false));
  assert.ok(baseline.items.every((areaItem) => areaItem.color === "#ef4444"));
  assert.match(baseline.label, /JWLA-033 Baseline/);

  const areaPanelSource = fs.readFileSync(new URL("./AreaPanel.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(areaPanelSource, /색은 033 기준\/현재 backend 경보경계/);
  assert.match(areaPanelSource, /JWLA Current Reference/);
  assert.doesNotMatch(areaPanelSource, /JWLA Version Comparison/);
  assert.doesNotMatch(areaPanelSource, /기존 구역 위에.*북쪽 확장분만/);

  assert.equal(bySection("jwc-installations").items.length, 2);
  assert.equal(bySection("jwc-countries").items.length, 22);
  assert.equal(bySection("ibf-itf").items.length, 11);
  assert.equal(bySection("ibf-itf").countLabel, "10 active · 1 withdrawn");
  assert.equal(bySection("iwl").items.length, 13);

  const labels = allRiskAreaItems().map((areaItem) => areaItem.label);
  assert.ok(labels.includes("Saudi Arabia"));
  assert.ok(labels.includes("Eritrea"));
  assert.ok(!bySection("jwc-countries").items.some((areaItem) => areaItem.label === "Guyana"));
  assert.ok(bySection("jwc-installations").items.some((areaItem) => areaItem.label.startsWith("Guyana")));
  assert.ok(!labels.includes("Pakistan"));
  assert.ok(!labels.includes("Mozambique (N.)"));
});

test("map keeps coastal data in a separate lazy reference, style ref, and focus path", () => {
  const restrictedSource = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(restrictedSource, /jwla-034-reference\.geojson/);
  assert.match(restrictedSource, /planCoastalLoadRequest/);
  assert.match(restrictedSource, /coastalLoadPlan\.shouldRequest/);
  assert.match(restrictedSource, /coastalRef\.current\?\.setStyle\(getStyle\)/);
  assert.match(restrictedSource, /\[areas, coastal, amendments, countries, installations, contractAlerts\]/);
  assert.match(restrictedSource, /jwla-034-amendments\.geojson/);
  assert.match(restrictedSource, /shouldLoadSectionLayers\("jwc-034-amendment"/);
  assert.match(restrictedSource, /CURRENT_REFERENCE_SCOPES/);
  assert.match(restrictedSource, /"defined-waters"/);
  assert.match(restrictedSource, /geometryRole === "installation-context-only"/);
  assert.match(restrictedSource, /scope === "installation-context-only"/);
  assert.match(restrictedSource, /fillOpacity: isInstallationContext \? 0/);
  assert.doesNotMatch(restrictedSource, /const AREA_URL = "\/risk-areas\/jwla-034-amendments\.geojson"/);
});

test("coastal lazy-load predicate ignores startup and style-only state but loads for visibility or focus", () => {
  assert.equal(typeof riskAreaCatalog.shouldLoadCoastalLayers, "function");
  const current = bySection("jwc-034-current");
  const [syria, russia] = current.items.slice(4);
  assert.equal(riskAreaCatalog.shouldLoadCoastalLayers({}, null), false);
  assert.equal(riskAreaCatalog.shouldLoadCoastalLayers({
    [syria.layerKeys[0]]: { visible: false, color: "#123456", opacity: 0.9 },
  }, null), false);
  assert.equal(riskAreaCatalog.shouldLoadCoastalLayers({
    [current.items[0].layerKeys[0]]: { visible: true },
  }, null), false);
  assert.equal(riskAreaCatalog.shouldLoadCoastalLayers({
    [syria.layerKeys[0]]: { visible: true },
  }, null), true);
  assert.equal(riskAreaCatalog.shouldLoadCoastalLayers({}, russia.layerKeys[0]), true);
});

test("coastal load planner excludes its URL at startup and requests it exactly once for visibility or focus", () => {
  const coastalUrl = "/risk-areas/jwla-034-coastal-waters.geojson";
  const current = bySection("jwc-034-current");
  const [syria, russia] = current.items.slice(4);
  assert.deepEqual(planCoastalLoadRequest({ settings: {}, focusKey: null, loaded: false }), {
    shouldLoad: false, shouldRequest: false, urls: [],
  });
  assert.deepEqual(planCoastalLoadRequest({
    settings: { [syria.layerKeys[0]]: { visible: true } }, focusKey: null, loaded: false,
  }), { shouldLoad: true, shouldRequest: true, urls: [coastalUrl] });
  assert.deepEqual(planCoastalLoadRequest({ settings: {}, focusKey: russia.layerKeys[0], loaded: false }), {
    shouldLoad: true, shouldRequest: true, urls: [coastalUrl],
  });
  assert.deepEqual(planCoastalLoadRequest({ settings: {}, focusKey: russia.layerKeys[0], loaded: true }), {
    shouldLoad: true, shouldRequest: false, urls: [],
  });
});

test("feature bounds exclude the antimeridian gap while preserving ordinary Syria bounds", () => {
  const coastal = readGeoJSON("jwla-034-coastal-waters.geojson");
  const syria = featureByName(coastal, "JWLA 034 Coastal Waters - Syria 12NM");
  const russia = featureByName(coastal, "JWLA 034 Coastal Waters - Russia 12NM");
  assert.deepEqual(getFeatureBounds(syria), [
    [34.59925086, 35.47134643],
    [36.03456464, 35.97254309],
  ]);
  const russiaBounds = getFeatureBounds(russia);
  const russiaWidth = russiaBounds[1][1] - russiaBounds[0][1];
  assert.ok(russiaWidth > 0 && russiaWidth < 250, `Russia focus width remained world-scale: ${russiaWidth}`);
  assert.deepEqual(russiaBounds.map(([lat]) => lat), [41.84196511, 82.05827656]);
});

test("feature popup exposes accessible Marine Regions source attribution and license", () => {
  assert.equal(typeof riskAreaCatalog.buildFeaturePopupContent, "function");
  const content = riskAreaCatalog.buildFeaturePopupContent({
    properties: {
      name: "JWLA 034 Coastal Waters - Syria 12NM",
      geometryStatus: "reference-only",
      attribution: "Marine Regions / Flanders Marine Institute (VLIZ)",
      sourceUrl: "https://geo.vliz.be/geoserver/MarineRegions/ows",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      subsetStatus: "reviewed-subset",
      derivedStatus: "derived-display-reference",
    },
  });
  assert.match(content, /role="region"/);
  assert.match(content, /aria-label="Risk area source and license"/);
  assert.match(content, /Marine Regions.*VLIZ/);
  assert.match(content, /href="https:\/\/geo\.vliz\.be/);
  assert.match(content, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/);
  assert.match(content, /reviewed-subset.*derived-display-reference/);

  const hostile = riskAreaCatalog.buildFeaturePopupContent({
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

test("stored explicit visibility migrates once without losing user choices or appearance", () => {
  const legacyKey = bySection("contract-alerts").items[0].layerKeys[0];
  const migrated = migrateRiskAreaSettings({
    [legacyKey]: { visible: true, color: "#123456", opacity: 0.2 },
  });
  assert.equal(migrated[legacyKey].visible, true);
  assert.equal(migrated[legacyKey].color, "#123456");
  assert.equal(migrated.__jwlaCurrentDefaultsVersion, 1);

  const userChanged = {
    ...migrated,
    [legacyKey]: { ...migrated[legacyKey], visible: true },
  };
  assert.deepEqual(migrateRiskAreaSettings(userChanged), userChanged);
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

  const israel = bySection("contract-alerts").items.find((areaItem) => (
    areaItem.layerKeys.includes("Israel 12NM Territorial Waters")
  ));
  assert.ok(israel);
  assert.equal(isItemVisible({}, israel), false);
  assert.equal(isItemVisible({
    "Israel 12NM Territorial Waters": { visible: false },
  }, israel), false);
});

test("Black Sea defined waters follow the official JWLA boundary and exclude Georgian waters south of the Russia border", () => {
  const global = JSON.parse(fs.readFileSync(new URL("../../public/war-risk-zone-global.geojson", import.meta.url), "utf8"));
  const blackSea = featureByName(global, "JWLA 033 - Black Sea & Sea of Azov");
  assert.ok(blackSea);

  const bounds = turf.bbox(blackSea);
  assert.ok(bounds[1] >= 43.38, `Black Sea zone extends south of the official Russia-Georgia endpoint: ${bounds[1]}`);
  assert.equal(turf.booleanPointInPolygon(turf.point([41.4, 41.7]), blackSea), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([39.8, 43.5]), blackSea), true);
  assert.match(blackSea.properties?.sourceDocument || "", /JWLA-033.*JWLA-034/);
  assert.equal(blackSea.properties?.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");
});

test("Venezuela and Guyana EEZ geometries are explicitly installation context, not definitive transit geofences", () => {
  const global = JSON.parse(fs.readFileSync(new URL("../../public/war-risk-zone-global.geojson", import.meta.url), "utf8"));
  for (const [name, mrgid] of [
    ["JWLA 033 - Venezuela (Offshore EEZ)", 8433],
    ["JWLA 033 - Guyana (Offshore EEZ)", 8460],
  ]) {
    const feature = featureByName(global, name);
    assert.ok(feature);
    assert.equal(feature.properties?.geometryRole, "installation-context-only");
    assert.equal(feature.properties?.detectionMode, "facility-visit-manual-review");
    assert.equal(feature.properties?.manualReviewRequired, true);
    assert.equal(feature.properties?.marineRegionsMrgid, mrgid);
    assert.match(feature.properties?.warning || "", /transit/i);
  }
});

test("offshore installation calls have a dedicated lazy-loaded render asset", () => {
  const assetUrl = new URL("../../public/risk-areas/jwla-034-installations.geojson", import.meta.url);
  assert.equal(fs.existsSync(assetUrl), true, "installation reference asset is missing");
  const asset = JSON.parse(fs.readFileSync(assetUrl, "utf8"));
  assert.deepEqual(asset.features.map((feature) => feature.properties?.name).sort(), [
    "JWLA 034 - Guyana Offshore Installation Reference",
    "JWLA 034 - Venezuela Offshore Installation Reference",
  ]);
  assert.ok(asset.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(asset.features.every((feature) => turf.booleanValid(feature)));

  const restrictedSource = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(restrictedSource, /jwla-034-installations\.geojson/);
  assert.match(restrictedSource, /shouldLoadSectionLayers\("jwc-installations"/);
});

test("JWLA-034 source GeoJSON remains valid and the UI amendment asset contains only the northward delta", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const coastal = readGeoJSON("jwla-034-coastal-waters.geojson");
  const countries = readGeoJSON("jwla-034-countries.geojson");
  const amendments = readGeoJSON("jwla-034-amendments.geojson");
  assert.equal(areas.features.length, 6);
  assert.equal(coastal.features.length, 2);
  assert.equal(countries.features.length, 22);
  assert.equal(amendments.features.length, 1);

  const amendmentSectionKeys = new Set(bySection("jwc-034-amendment").items.flatMap((areaItem) => areaItem.layerKeys));
  const amendmentFeatureNames = new Set(amendments.features.map((feature) => feature.properties?.name));
  assert.deepEqual(amendmentFeatureNames, amendmentSectionKeys);

  const allFeatures = [...areas.features, ...coastal.features, ...countries.features, ...amendments.features];
  assert.equal(new Set(allFeatures.map((feature) => feature.id)).size, allFeatures.length);
  for (const feature of allFeatures) {
    assert.ok(feature.id);
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
    assert.equal(feature.properties?.contractAlertEligible, false);
    assert.equal(feature.properties?.circular, "JWLA-034");
    if (feature.properties?.scope === "named-country-coastal-waters") {
      assert.equal(feature.properties?.sourceSha256, "00b007a2a76df5b7a59fc8349c0184d1f561da12c3cec5f5acf65d5f10ad4a6f");
    } else {
      assert.equal(feature.properties?.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");
    }
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

test("verified Syria and Russia 12NM references are stable display-only current features", () => {
  const reference = readGeoJSON("jwla-034-reference.geojson");
  const coastal = readGeoJSON("jwla-034-coastal-waters.geojson");
  assert.equal(reference.features.some((feature) => feature.properties?.scope === "named-country-coastal-waters"), false);
  assert.deepEqual(coastal.features.map((feature) => feature.id), [
    "jwla-034:coastal:SYR:12nm",
    "jwla-034:coastal:RUS:12nm",
  ]);
  assert.deepEqual(coastal.features.map((feature) => feature.properties?.marineRegionsMrgid), [49096, 49031]);
  assert.ok(coastal.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(coastal.features.every((feature) => feature.properties?.geometryStatus === "reference-only"));
  assert.ok(coastal.features.every((feature) => feature.properties?.sourceDatasetVersion === "v4"));
});

test("the full JWLA-034 reference still records the amended limit and Cabo includes Tanzania", () => {
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
