import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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
  assert.match(restrictedSource, /\[areas, coastal, provisionalCoastal, precisionReferences, amendments, countries, installations, contractAlerts\]/);
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

test("provisional coastal catalog is a separate default-off section with exact ready and withheld items", () => {
  const section = bySection("jwc-034-provisional-coastal");
  assert.ok(section);
  assert.equal(section.label, "JWLA-034 Provisional Coastal References");
  assert.equal(section.countLabel, "18 provisional · 2 withheld for manual review");
  assert.equal(section.defaultOpen, false);

  const expected = [
    ["jwc-034-coastal-bahrain", "JWLA 034 Coastal Waters - Bahrain 12NM"],
    ["jwc-034-coastal-iran", "JWLA 034 Coastal Waters - Iran 12NM"],
    ["jwc-034-coastal-iraq", "JWLA 034 Coastal Waters - Iraq 12NM"],
    ["jwc-034-coastal-kuwait", "JWLA 034 Coastal Waters - Kuwait 12NM"],
    ["jwc-034-coastal-oman", "JWLA 034 Coastal Waters - Oman 12NM"],
    ["jwc-034-coastal-qatar", "JWLA 034 Coastal Waters - Qatar 12NM"],
    ["jwc-034-coastal-saudi-arabia", "JWLA 034 Coastal Waters - Saudi Arabia 12NM"],
    ["jwc-034-coastal-uae", "JWLA 034 Coastal Waters - United Arab Emirates 12NM"],
    ["jwc-034-coastal-yemen", "JWLA 034 Coastal Waters - Yemen 12NM"],
    ["jwc-034-coastal-djibouti", "JWLA 034 Coastal Waters - Djibouti 12NM"],
    ["jwc-034-coastal-eritrea", "JWLA 034 Coastal Waters - Eritrea 12NM"],
    ["jwc-034-coastal-libya", "JWLA 034 Coastal Waters - Libya 12NM"],
    ["jwc-034-coastal-somalia", "JWLA 034 Coastal Waters - Somalia 12NM"],
    ["jwc-034-coastal-sudan", "JWLA 034 Coastal Waters - Sudan 12NM"],
    ["jwc-034-coastal-benin", "JWLA 034 Coastal Waters - Benin 12NM"],
    ["jwc-034-coastal-nigeria", "JWLA 034 Coastal Waters - Nigeria 12NM"],
    ["jwc-034-coastal-togo", "JWLA 034 Coastal Waters - Togo 12NM"],
    ["jwc-034-coastal-venezuela", "JWLA 034 Coastal Waters - Venezuela 12NM"],
  ];
  const ready = section.items.filter((areaItem) => areaItem.dataStatus === "ready");
  assert.deepEqual(ready.map((areaItem) => [areaItem.id, areaItem.layerKeys[0]]), expected);
  assert.ok(ready.every((areaItem) => areaItem.defaultVisible === false));
  assert.ok(ready.every((areaItem) => areaItem.badge === "PROVISIONAL"));
  assert.ok(ready.every((areaItem) => /display-only.*manual review/i.test(areaItem.note)));

  const withheld = section.items.filter((areaItem) => areaItem.dataStatus === "manual-review");
  assert.deepEqual(withheld.map((areaItem) => areaItem.id), ["jwc-034-coastal-israel", "jwc-034-coastal-lebanon"]);
  assert.ok(withheld.every((areaItem) => areaItem.layerKeys.length === 0));
  assert.ok(withheld.every((areaItem) => areaItem.defaultVisible === false));
  for (const areaItem of withheld) {
    const settings = {};
    assert.equal(applyItemVisibility(settings, areaItem, true), settings);
    assert.equal(isItemVisible(settings, areaItem), false);
  }
  assert.equal(shouldLoadSectionLayers(section.id, {}, null), false);
});

test("provisional output has exact stable IDs and display-only metadata aligned with the catalog", () => {
  const output = readGeoJSON("jwla-034-coastal-waters-provisional.geojson");
  const section = bySection("jwc-034-provisional-coastal");
  const readyKeys = section.items.filter((areaItem) => areaItem.dataStatus === "ready").map((areaItem) => areaItem.layerKeys[0]);
  assert.deepEqual(output.features.map((feature) => feature.id), [
    "jwla-034:coastal:BHR:12nm", "jwla-034:coastal:IRN:12nm", "jwla-034:coastal:IRQ:12nm",
    "jwla-034:coastal:KWT:12nm", "jwla-034:coastal:OMN:12nm", "jwla-034:coastal:QAT:12nm",
    "jwla-034:coastal:SAU:12nm", "jwla-034:coastal:ARE:12nm", "jwla-034:coastal:YEM:12nm",
    "jwla-034:coastal:DJI:12nm", "jwla-034:coastal:ERI:12nm", "jwla-034:coastal:LBY:12nm",
    "jwla-034:coastal:SOM:12nm", "jwla-034:coastal:SDN:12nm", "jwla-034:coastal:BEN:12nm",
    "jwla-034:coastal:NGA:12nm", "jwla-034:coastal:TGO:12nm", "jwla-034:coastal:VEN:12nm",
  ]);
  assert.deepEqual(output.features.map((feature) => feature.properties?.marineRegionsMrgid), [
    49081, 49183, 49184, 49080, 49077, 49182, 49079, 49083, 49076,
    49075, 49074, 49095, 49073, 49078, 49113, 49188, 49112, 49150,
  ]);
  assert.deepEqual(output.features.map((feature) => feature.properties?.name), readyKeys);
  assert.ok(output.features.every((feature) => feature.properties?.scope === "named-country-coastal-waters"));
  assert.ok(output.features.every((feature) => feature.properties?.geometryStatus === "provisional-reference-only"));
  assert.ok(output.features.every((feature) => feature.properties?.monitoringMode === "reference-only"));
  assert.ok(output.features.every((feature) => feature.properties?.subsetStatus === "provisional-unreviewed-subset"));
  assert.ok(output.features.every((feature) => feature.properties?.derivedStatus === "provisional-display-reference"));
  assert.ok(output.features.every((feature) => feature.properties?.sourceArtifactSha256 === "055c17d26b7aa7814708d3d73b7110571349303a93a5bc12d9475da31fdcdbdd"));
  assert.ok(output.features.every((feature) => feature.properties?.manualReviewRequired === true));
  assert.ok(output.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(!output.features.some((feature) => ["ISR", "LBN"].includes(feature.id.split(":")[2])));
});

test("provisional planner requests only its URL once for ready visibility or focus and stays isolated", () => {
  assert.equal(typeof riskAreaCatalog.planProvisionalCoastalLoadRequest, "function");
  const url = "/risk-areas/jwla-034-coastal-waters-provisional.geojson";
  const section = bySection("jwc-034-provisional-coastal");
  const bahrain = section.items[0];
  const israel = section.items.find((areaItem) => areaItem.id === "jwc-034-coastal-israel");
  const syria = bySection("jwc-034-current").items[4];
  const plan = riskAreaCatalog.planProvisionalCoastalLoadRequest;
  assert.deepEqual(plan({}), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ settings: { [bahrain.layerKeys[0]]: { visible: false, color: "#fff", opacity: 0.4 } } }), {
    shouldLoad: false, shouldRequest: false, urls: [],
  });
  assert.deepEqual(plan({ settings: { [bahrain.layerKeys[0]]: { visible: true } } }), {
    shouldLoad: true, shouldRequest: true, urls: [url],
  });
  assert.deepEqual(plan({ focusKey: bahrain.layerKeys[0] }), { shouldLoad: true, shouldRequest: true, urls: [url] });
  assert.deepEqual(plan({ focusKey: bahrain.layerKeys[0], loaded: true }), { shouldLoad: true, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ focusKey: israel.layerKeys[0] }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ focusKey: syria.layerKeys[0] }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(planCoastalLoadRequest({ focusKey: bahrain.layerKeys[0] }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(planCoastalLoadRequest({ focusKey: syria.layerKeys[0] }).urls, ["/risk-areas/jwla-034-coastal-waters.geojson"]);
});

test("RestrictedZone consumes the provisional planner with separate state, style, focus and popup paths", () => {
  const source = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(source, /provisionalCoastalRequestUrl = provisionalCoastalLoadPlan\.urls\[0\]/);
  assert.match(source, /planProvisionalCoastalLoadRequest/);
  assert.match(source, /provisionalCoastalLoadPlan\.shouldRequest/);
  assert.match(source, /provisionalCoastalRef\.current\?\.setStyle\(getStyle\)/);
  assert.match(source, /\[areas, coastal, provisionalCoastal, precisionReferences, amendments, countries, installations, contractAlerts\]/);
  assert.match(source, /data=\{provisionalCoastal\}/);
  assert.match(source, /onEachFeature=\{onEachFeature\}/);
});

test("precision references are a separate default-off display-only catalog with an unresolved inland row", () => {
  const section = bySection("jwc-034-precision-references");
  assert.ok(section);
  assert.equal(section.label, "JWLA-034 Precision References (Display Only)");
  assert.equal(section.countLabel, "3 derived references · inland waters unresolved");
  assert.equal(section.defaultOpen, false);

  const ready = section.items.filter((areaItem) => areaItem.dataStatus === "ready");
  assert.deepEqual(ready.map((areaItem) => ({
    id: areaItem.id,
    layerKey: areaItem.layerKeys[0],
    badge: areaItem.badge,
  })), [
    {
      id: "jwc-034-precision-black-sea-azov-marine",
      layerKey: "JWLA 034 Precision Reference - Black Sea and Sea of Azov Marine Waters",
      badge: "DERIVED",
    },
    {
      id: "jwc-034-precision-gulf-of-guinea-water",
      layerKey: "JWLA 034 Precision Reference - Gulf of Guinea Water Only",
      badge: "DERIVED",
    },
    {
      id: "jwc-034-precision-iran-caspian-12nm",
      layerKey: "JWLA 034 Precision Reference - Iran Caspian 12NM Provisional",
      badge: "PROVISIONAL",
    },
  ]);
  assert.ok(ready.every((areaItem) => areaItem.defaultVisible === false));
  assert.ok(ready.every((areaItem) => areaItem.manualReviewRequired === true));
  assert.ok(ready.every((areaItem) => areaItem.contractAlertEligible === false));
  assert.ok(ready.every((areaItem) => /manual review/i.test(areaItem.note)));
  assert.ok(ready.every((areaItem) => /cartographic|non-authoritative|not authoritative/i.test(areaItem.note)));

  const unresolved = section.items.find((areaItem) => areaItem.id === "jwc-034-precision-inland-waters-unresolved");
  assert.equal(unresolved.label, "Ukraine / Don / Donets / Belarus inland waters");
  assert.deepEqual(unresolved.layerKeys, []);
  assert.equal(unresolved.defaultVisible, false);
  assert.equal(unresolved.dataStatus, "manual-review");
  assert.equal(unresolved.badge, "UNRESOLVED");
  assert.match(unresolved.note, /manual review/i);
  assert.match(unresolved.note, /not.*toggle|cannot.*toggle/i);
  assert.equal(applyItemVisibility({}, unresolved, true).layerKeys, undefined);
  assert.equal(isItemVisible({}, unresolved), false);
});

test("precision output has exact stable IDs, names, statuses and display-only provenance metadata", () => {
  const output = readGeoJSON("jwla-034-precision-references.geojson");
  const section = bySection("jwc-034-precision-references");
  const readyKeys = section.items.filter((areaItem) => areaItem.dataStatus === "ready").map((areaItem) => areaItem.layerKeys[0]);
  assert.equal(output.features.length, 3);
  assert.deepEqual(output.features.map((feature) => feature.id), [
    "jwla-034:precision:black-sea-azov-marine",
    "jwla-034:precision:gulf-of-guinea-water",
    "jwla-034:precision:iran-caspian-12nm",
  ]);
  assert.deepEqual(output.features.map((feature) => feature.properties?.name), readyKeys);
  assert.deepEqual(output.features.map((feature) => feature.properties?.geometryStatus), [
    "derived-marine-reference-inland-waters-excluded",
    "derived-water-only-reference",
    "provisional-derived-12nm-reference",
  ]);
  assert.ok(output.features.every((feature) => feature.properties?.mapKind === "precision-reference-display-only"));
  assert.ok(output.features.every((feature) => feature.properties?.scope === "precision-reference"));
  assert.ok(output.features.every((feature) => feature.properties?.reviewStatus === "manual-review-display-only"));
  assert.ok(output.features.every((feature) => feature.properties?.manualReviewRequired === true));
  assert.ok(output.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(output.features.every((feature) => feature.properties?.naturalEarthVersion === "v5.1.2"));
  assert.ok(output.features.every((feature) => feature.properties?.license === "Public domain"));
  assert.ok(output.features.every((feature) => feature.properties?.licenseUrl === "https://www.naturalearthdata.com/about/terms-of-use/"));
  assert.ok(output.features.every((feature) => feature.properties?.sourceDocumentSha256 === JWLA_REFERENCE.sourceSha256));
  assert.ok(output.features.every((feature) => feature.properties?.sourceArtifactSha256 === "1b18b7248d47e3c4db53cb2cb80be635dcca781149ec6aabfeea4bf9ce164f22"));
  assert.ok(output.features.every((feature) => feature.properties?.limitations?.length >= 2));
});

test("precision planner requests only its asset once for ready visibility or focus and stays isolated", () => {
  assert.equal(typeof riskAreaCatalog.planPrecisionReferenceLoadRequest, "function");
  const url = "/risk-areas/jwla-034-precision-references.geojson";
  const section = bySection("jwc-034-precision-references");
  const ready = section.items[0];
  const unresolved = section.items.find((areaItem) => areaItem.dataStatus === "manual-review");
  const coastal = bySection("jwc-034-current").items[4];
  const provisional = bySection("jwc-034-provisional-coastal").items[0];
  const plan = riskAreaCatalog.planPrecisionReferenceLoadRequest;
  assert.deepEqual(plan({}), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ settings: { [ready.layerKeys[0]]: { visible: false, color: "#fff", opacity: 0.4 } } }), {
    shouldLoad: false, shouldRequest: false, urls: [],
  });
  assert.deepEqual(plan({ settings: { [ready.layerKeys[0]]: { visible: true } } }), {
    shouldLoad: true, shouldRequest: true, urls: [url],
  });
  assert.deepEqual(plan({ focusKey: ready.layerKeys[0] }), { shouldLoad: true, shouldRequest: true, urls: [url] });
  assert.deepEqual(plan({ focusKey: ready.layerKeys[0], loaded: true }), { shouldLoad: true, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ focusKey: unresolved.id }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ focusKey: coastal.layerKeys[0] }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ focusKey: provisional.layerKeys[0] }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(planCoastalLoadRequest({ focusKey: ready.layerKeys[0] }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(riskAreaCatalog.planProvisionalCoastalLoadRequest({ focusKey: ready.layerKeys[0] }), {
    shouldLoad: false, shouldRequest: false, urls: [],
  });
});

test("RestrictedZone consumes the precision planner through separate load, style, focus and safe popup wiring", () => {
  const source = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(source, /planPrecisionReferenceLoadRequest/);
  assert.match(source, /precisionRequestUrl = precisionLoadPlan\.urls\[0\]/);
  assert.match(source, /precisionLoadPlan\.shouldRequest/);
  assert.match(source, /setPrecisionReferences\(await response\.json\(\)\)/);
  assert.match(source, /precisionRef\.current\?\.setStyle\(getStyle\)/);
  assert.match(source, /\[areas, coastal, provisionalCoastal, precisionReferences, amendments, countries, installations, contractAlerts\]/);
  assert.match(source, /data=\{precisionReferences\}/);
  assert.match(source, /ref=\{precisionRef\}/);
  assert.match(source, /onEachFeature=\{onEachFeature\}/);
  assert.equal((source.match(/buildFeaturePopupContent\(feature\)/g) || []).length, 1);
});

test("precision popup reuses URL allowlisting and HTML escaping for Natural Earth metadata", () => {
  const output = readGeoJSON("jwla-034-precision-references.geojson");
  const content = riskAreaCatalog.buildFeaturePopupContent(output.features[0]);
  assert.match(content, /Public domain/);
  assert.match(content, /href="https:\/\/www\.naturalearthdata\.com\/about\/terms-of-use\/"/);
  assert.match(content, /Manual review required/);
  assert.match(content, /not used for backend contract alerts/);
  const hostile = structuredClone(output.features[0]);
  hostile.properties.name = '<img src=x onerror="alert(1)">';
  hostile.properties.licenseUrl = "javascript:alert(1)";
  const escaped = riskAreaCatalog.buildFeaturePopupContent(hostile);
  assert.doesNotMatch(escaped, /<img|href="javascript:/i);
  assert.match(escaped, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("precision README records reproducible derivations, attribution, warnings and unresolved scope", () => {
  const readme = fs.readFileSync(new URL("../../public/risk-areas/README.md", import.meta.url), "utf8");
  assert.match(readme, /## Precision reference derivation recipes/);
  assert.match(readme, /Black Sea.*nine.*anchor.*Natural Earth.*ocean/is);
  assert.match(readme, /Gulf of Guinea.*three.*anchor.*Natural Earth.*ocean/is);
  assert.match(readme, /Iran Caspian.*azimuthal equidistant.*Caspian/is);
  assert.match(readme, /Iran Caspian.*22,224 ?m/is);
  assert.match(readme, /Natural Earth.*public domain/is);
  assert.match(readme, /https:\/\/www\.naturalearthdata\.com\/about\/terms-of-use\//);
  assert.match(readme, /not for navigation/i);
  assert.match(readme, /not.*backend.*alert/i);
  assert.match(readme, /Ukraine.*Don.*Donets.*Belarus/is);
  assert.match(readme, /inland.*unresolved/is);
  assert.match(readme, /facility.*manual review/is);
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
      manualReviewRequired: true,
      contractAlertEligible: false,
    },
  });
  assert.match(content, /role="region"/);
  assert.match(content, /aria-label="Risk area source and license"/);
  assert.match(content, /Marine Regions.*VLIZ/);
  assert.match(content, /href="https:\/\/geo\.vliz\.be/);
  assert.match(content, /href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/);
  assert.match(content, /reviewed-subset.*derived-display-reference/);
  assert.match(content, /Manual review required/);
  assert.match(content, /not used for backend contract alerts/);

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

test("backend contract alert inputs remain byte-identical", () => {
  const expected = new Map([
    ["../../../backend/src/services/geofenceChecker.js", "753ba3d74b44e63a08064c97ef7228621bcbf0a31bb04906d150259dcdb09d83"],
    ["../../public/war-risk-zone.geojson", "a8ed1684db314eb1161957aa14f18c6129036ff47bf10a53ee619046fe89e56c"],
    ["../../public/12nm_bounds.geojson", "0a70346fac027f6bf4bb53e68a55e32c9d931b99389e7afd990e0fe6768a0f3b"],
    ["../../public/war-risk-zone-global.geojson", "58a9dedb2fac16a6008208468fba76924f3db52fc0eb022044b62425938ab94d"],
  ]);
  for (const [path, digest] of expected) {
    const bytes = fs.readFileSync(new URL(path, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), digest, path);
  }
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
