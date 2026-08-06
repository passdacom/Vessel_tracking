import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import * as turf from "@turf/turf";
import {
  JWLA_REFERENCE,
  RISK_AREA_SECTIONS,
  allRiskAreaItems,
  applyItemVisibility,
  applySectionAppearance,
  buildFeaturePopupContent,
  getCalendarStatus,
  getFeatureBounds,
  getLayerDefaults,
  isComparisonModeEnabled,
  isItemVisible,
  migrateRiskAreaSettings,
  planCoastalLoadRequest,
  planDefinedWaterLoadRequest,
  planProvisionalCoastalLoadRequest,
  resetSectionAppearance,
  setComparisonMode,
  shouldLoadInstallationLayers,
  shouldLoadSectionLayers,
} from "./riskAreaCatalog.js";

const publicPath = (name) => new URL(`../../public/risk-areas/${name}`, import.meta.url);
const readGeoJSON = (name) => JSON.parse(fs.readFileSync(publicPath(name), "utf8"));
const bySection = (id) => RISK_AREA_SECTIONS.find((section) => section.id === id);
const bySubsection = (id) => RISK_AREA_SECTIONS.flatMap((section) => section.subsections || []).find((section) => section.id === id);
const featureByName = (collection, name) => collection.features.find((feature) => feature.properties?.name === name);

const defined = () => bySubsection("jwla-034-defined-waters");
const countries = () => bySubsection("jwla-034-named-countries");
const special = () => bySubsection("jwla-034-special-call-only");

function country(label) {
  return countries().items.find((areaItem) => areaItem.label === label);
}

test("catalog source and default JWLA-034 defined waters are current and exact", () => {
  assert.equal(JWLA_REFERENCE.circular, "JWLA-034");
  assert.equal(JWLA_REFERENCE.previousCircular, "JWLA-033");
  assert.equal(JWLA_REFERENCE.publishedAt, "2026-07-29");
  assert.match(JWLA_REFERENCE.sourceUrl, /lmalloyds\.com\/.*JWLA-034/);
  assert.equal(JWLA_REFERENCE.sourceSha256, "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9");
  assert.deepEqual(defined().items.map((areaItem) => areaItem.layerKeys[0]), [
    "JWLA 034 - Persian Gulf",
    "JWLA 034 - Gulf of Oman",
    "JWLA 034 - Gulf of Aden",
    "JWLA 034 - Red Sea south of 18N",
    "JWLA 034 - Red Sea Added Area 18N to 25.5N",
    "JWLA 034 - Arabian Sea JWC West",
    "JWLA 034 - Indian Ocean JWC North-West",
    "JWLA 034 - Black Sea & Sea of Azov",
    "JWLA 034 - Gulf of Guinea",
    "JWLA 034 - Cabo Delgado",
  ]);
  assert.ok(defined().items.every((areaItem) => areaItem.defaultVisible));
  assert.equal(bySection("ibf-itf").items.length, 11);
  assert.equal(bySection("iwl").items.length, 13);
});

test("defined-water planner skips the asset when all ten styleable layers are hidden", () => {
  const hidden = Object.fromEntries(defined().items.map((areaItem) => [
    areaItem.layerKeys[0],
    { visible: false },
  ]));
  const plan = planDefinedWaterLoadRequest;
  assert.deepEqual(plan({ settings: hidden }), { shouldLoad: false, shouldRequest: false, urls: [] });
  assert.deepEqual(plan({ settings: hidden, focusKey: defined().items[0].layerKeys[0] }), {
    shouldLoad: true,
    shouldRequest: true,
    urls: ["/risk-areas/jwla-034-reference.geojson"],
  });
  assert.deepEqual(plan({ settings: {}, loaded: false }), {
    shouldLoad: true,
    shouldRequest: true,
    urls: ["/risk-areas/jwla-034-reference.geojson"],
  });
  assert.deepEqual(plan({ settings: {}, loaded: true }), { shouldLoad: true, shouldRequest: false, urls: [] });
});

test("named countries retain 22 official rows and attach geometry status to each row", () => {
  assert.equal(countries().items.length, 22);
  assert.ok(countries().items.some((areaItem) => areaItem.label === "Saudi Arabia"));
  assert.ok(countries().items.some((areaItem) => areaItem.label === "Eritrea"));
  assert.ok(!countries().items.some((areaItem) => areaItem.label === "Guyana"));
  assert.equal(special().items.length, 1);
  assert.match(special().items[0].label, /^Guyana/);
  assert.equal(country("Russia").geometryStatus, "verified");
  assert.equal(country("Syria").geometryStatus, "verified");
  assert.equal(country("Israel").geometryStatus, "existing-baseline");
  assert.equal(country("Lebanon").geometryStatus, "existing-baseline");
  assert.equal(country("Venezuela").geometryStatus, "provisional");
});

test("coastal planners load verified and provisional assets only for visible or focused country rows", () => {
  const syriaCoastal = country("Syria").layerKeys[0];
  const russiaCoastal = country("Russia").layerKeys[0];
  const bahrainCoastal = country("Bahrain").layerKeys[0];
  assert.equal(planCoastalLoadRequest({}).shouldLoad, true);
  assert.deepEqual(planCoastalLoadRequest({ focusKey: syriaCoastal }), {
    shouldLoad: true, shouldRequest: true, urls: ["/risk-areas/jwla-034-coastal-waters.geojson"],
  });
  assert.deepEqual(planCoastalLoadRequest({ settings: { [russiaCoastal]: { visible: true } }, loaded: true }), {
    shouldLoad: true, shouldRequest: false, urls: [],
  });
  assert.deepEqual(planProvisionalCoastalLoadRequest({}), {
    shouldLoad: true, shouldRequest: true, urls: ["/risk-areas/jwla-034-coastal-waters-provisional.geojson"],
  });
  assert.deepEqual(planProvisionalCoastalLoadRequest({ focusKey: bahrainCoastal }), {
    shouldLoad: true, shouldRequest: true, urls: ["/risk-areas/jwla-034-coastal-waters-provisional.geojson"],
  });
  const reviewedHidden = Object.fromEntries(
    countries().items.filter(({ geometryStatus }) => geometryStatus !== "provisional")
      .map((areaItem) => [areaItem.layerKeys[0], { visible: false }]),
  );
  const sourceReviewHidden = Object.fromEntries(
    countries().items.filter(({ geometryStatus }) => geometryStatus === "provisional")
      .map((areaItem) => [areaItem.layerKeys[0], { visible: false }]),
  );
  assert.equal(planCoastalLoadRequest({ settings: reviewedHidden, focusKey: bahrainCoastal }).shouldLoad, false);
  assert.equal(planProvisionalCoastalLoadRequest({ settings: sourceReviewHidden, focusKey: syriaCoastal }).shouldLoad, false);
});

test("country and installation assets are lazy and comparison assets use one gate", () => {
  const venezuela = country("Venezuela");
  const guyana = special().items[0];
  assert.equal(shouldLoadSectionLayers("jwla-034-named-countries", {}, null), true);
  assert.equal(shouldLoadSectionLayers("jwla-034-named-countries", {}, venezuela.layerKeys[0]), true);
  assert.equal(shouldLoadInstallationLayers({}, null), true);
  assert.equal(shouldLoadInstallationLayers({}, venezuela.layerKeys[1]), true);
  assert.equal(shouldLoadInstallationLayers(applyItemVisibility({}, guyana, true), null), true);
  const migrated = migrateRiskAreaSettings({ "JWC War Risk Zone - Persian Gulf": { visible: true } });
  assert.equal(isComparisonModeEnabled(migrated), false);
  assert.equal(isComparisonModeEnabled(setComparisonMode(migrated, true)), true);
});

test("RestrictedZone does not load implementation-status groups and gates JWLA-033 comparison", () => {
  const source = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(source, /planDefinedWaterLoadRequest/);
  assert.match(source, /planCoastalLoadRequest/);
  assert.match(source, /planProvisionalCoastalLoadRequest/);
  assert.match(source, /shouldLoadInstallationLayers/);
  assert.match(source, /isComparisonModeEnabled/);
  assert.match(source, /const shouldLoadContractAlerts = comparisonVisible/);
  assert.doesNotMatch(source, /COUNTRY_URL|visibleCountries|visibleAmendments/);
  assert.doesNotMatch(source, /planPrecisionReferenceLoadRequest/);
  assert.match(source, /geometryRole === "installation-context-only"/);
  assert.match(source, /fillOpacity: isInstallationContext \? 0/);
});

test("unreviewed source partition remains internal and all 22 current country coasts resolve", () => {
  const output = readGeoJSON("jwla-034-coastal-waters-provisional.geojson");
  const reviewed = readGeoJSON("jwla-034-coastal-waters.geojson");
  const catalogKeys = new Set(countries().items.flatMap((areaItem) => areaItem.layerKeys));
  assert.equal(output.features.length, 18);
  assert.ok(output.features.every((feature) => catalogKeys.has(feature.properties?.name)));
  assert.ok(output.features.every((feature) => feature.properties?.scope === "named-country-coastal-waters"));
  assert.ok(output.features.every((feature) => feature.properties?.geometryStatus === "provisional-reference-only"));
  assert.ok(output.features.every((feature) => feature.properties?.monitoringMode === "reference-only"));
  assert.ok(output.features.every((feature) => feature.properties?.manualReviewRequired === true));
  assert.ok(output.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(!output.features.some((feature) => ["ISR", "LBN"].includes(feature.id.split(":")[2])));
  assert.deepEqual(
    [...reviewed.features, ...output.features].map((feature) => feature.properties?.name).sort(),
    [...catalogKeys].filter((key) => /Coastal Waters/.test(key)).sort(),
  );
});

test("reviewed Syria and Russia plus existing Israel and Lebanon 12NM references remain current", () => {
  const reference = readGeoJSON("jwla-034-reference.geojson");
  const coastal = readGeoJSON("jwla-034-coastal-waters.geojson");
  assert.equal(reference.features.some((feature) => feature.properties?.scope === "named-country-coastal-waters"), false);
  assert.deepEqual(coastal.features.map((feature) => feature.id), [
    "jwla-034:coastal:SYR:12nm",
    "jwla-034:coastal:RUS:12nm",
    "jwla-034:coastal:ISR:12nm-existing",
    "jwla-034:coastal:LBN:12nm-existing",
  ]);
  assert.deepEqual(coastal.features.map((feature) => feature.properties?.marineRegionsMrgid), [49096, 49031, undefined, undefined]);
  assert.ok(coastal.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(coastal.features.every((feature) => ["reference-only", "existing-baseline-reference"].includes(feature.properties?.geometryStatus)));
});

test("precision artifact remains auditable but is not an exposed map group", () => {
  const output = readGeoJSON("jwla-034-precision-references.geojson");
  assert.equal(output.features.length, 3);
  assert.ok(output.features.every((feature) => feature.properties?.mapKind === "precision-reference-display-only"));
  assert.ok(output.features.every((feature) => feature.properties?.manualReviewRequired === true));
  assert.ok(output.features.every((feature) => feature.properties?.contractAlertEligible === false));
  assert.ok(output.features.every((feature) => feature.properties?.sourceDocumentSha256 === JWLA_REFERENCE.sourceSha256));
  assert.ok(RISK_AREA_SECTIONS.every((section) => !/Precision/.test(section.label)));
});

test("feature bounds avoid antimeridian gaps and preserve ordinary Syria bounds", () => {
  const coastal = readGeoJSON("jwla-034-coastal-waters.geojson");
  const syria = featureByName(coastal, "JWLA 034 Coastal Waters - Syria 12NM");
  const russia = featureByName(coastal, "JWLA 034 Coastal Waters - Russia 12NM");
  assert.deepEqual(getFeatureBounds(syria), [[34.59925086, 35.47134643], [36.03456464, 35.97254309]]);
  const russiaBounds = getFeatureBounds(russia);
  assert.ok(russiaBounds[1][1] - russiaBounds[0][1] < 250);
});

test("popup source metadata is accessible, URL-allowlisted and HTML-escaped", () => {
  const content = buildFeaturePopupContent({ properties: {
    name: "Syria 12NM",
    geometryStatus: "reference-only",
    attribution: "Marine Regions / VLIZ",
    sourceUrl: "https://geo.vliz.be/geoserver/MarineRegions/ows",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    manualReviewRequired: true,
    contractAlertEligible: false,
  } });
  assert.match(content, /role="region"/);
  assert.match(content, /href="https:\/\/geo\.vliz\.be/);
  assert.match(content, /Manual review required/);
  const hostile = buildFeaturePopupContent({ properties: {
    name: '<img src=x onerror="alert(1)">',
    attribution: "<script>alert(1)</script>",
    sourceUrl: "javascript:alert(1)",
  } });
  assert.doesNotMatch(hostile, /<img|<script|href="javascript:/i);
  assert.match(hostile, /&lt;img/);
});

test("visibility migration preserves old child choices while introducing comparison default off", () => {
  const key = "JWC War Risk Zone - Persian Gulf";
  const migrated = migrateRiskAreaSettings({ [key]: { visible: true, color: "#123456", opacity: 0.2 } });
  assert.deepEqual(migrated[key], { visible: true, color: "#123456", opacity: 0.2 });
  assert.equal(isComparisonModeEnabled(migrated), false);
  assert.equal(migrateRiskAreaSettings(migrated), migrated);
});

test("catalog v2 migrates the combined current layer into seven independently styled subregions", () => {
  const combined = { visible: false, color: "#123456", opacity: 0.24 };
  const migrated = migrateRiskAreaSettings({
    __jwlaCatalogVersion: 2,
    "JWLA 034 - Combined Middle East and Southern Red Sea Waters": combined,
  });
  assert.equal(migrated.__jwlaCatalogVersion, 3);
  for (const areaItem of defined().items.filter(({ group }) => group === "Middle East & Southern Red Sea")) {
    assert.deepEqual(migrated[areaItem.layerKeys[0]], combined);
  }
});

test("IBF/ITF and IWL status data remain intact", () => {
  const crewItems = bySection("ibf-itf").items;
  assert.equal(crewItems.filter((areaItem) => areaItem.designationStatus === "active").length, 10);
  assert.equal(crewItems.find((areaItem) => areaItem.id === "ibf-gulf-guinea-erz").designationStatus, "withdrawn");
  const iwlItems = bySection("iwl").items;
  const asOf = new Date("2026-07-30T00:00:00Z");
  assert.equal(iwlItems.filter((areaItem) => getCalendarStatus(areaItem, asOf) === "ACTIVE").length, 7);
  assert.equal(iwlItems.filter((areaItem) => getCalendarStatus(areaItem, asOf) === "INACTIVE").length, 6);
});

test("catalog identifiers and layer keys are unique", () => {
  const items = allRiskAreaItems();
  assert.equal(new Set(items.map((areaItem) => areaItem.id)).size, items.length);
  const layerKeys = items.flatMap((areaItem) => areaItem.layerKeys || []);
  assert.equal(new Set(layerKeys).size, layerKeys.length);
});

test("compound country visibility updates 12NM and installation layers together", () => {
  const venezuela = country("Venezuela");
  const on = applyItemVisibility({}, venezuela, true);
  assert.equal(isItemVisible(on, venezuela), true);
  assert.ok(venezuela.layerKeys.every((key) => on[key].visible));
  const off = applyItemVisibility(on, venezuela, false);
  assert.equal(isItemVisible(off, venezuela), false);
});

test("section appearance and reset update all ready compound layers while preserving visibility", () => {
  const section = countries();
  const venezuela = country("Venezuela");
  const initial = applyItemVisibility({}, venezuela, true);
  const updated = applySectionAppearance(initial, section, { color: "#abcdef", opacity: 0.18 });
  assert.ok(venezuela.layerKeys.every((key) => updated[key].color === "#abcdef" && updated[key].visible));
  const reset = resetSectionAppearance(updated, section);
  assert.ok(venezuela.layerKeys.every((key) => reset[key].color === venezuela.color && reset[key].visible));
});

test("modal remains viewport-bounded with an internal scroll region", () => {
  const modal = fs.readFileSync(new URL("../components/ZoneSettingsPanel.jsx", import.meta.url), "utf8");
  const panel = fs.readFileSync(new URL("./AreaPanel.jsx", import.meta.url), "utf8");
  assert.match(modal, /h-\[88dvh\]/);
  assert.match(panel, /data-testid="risk-settings-scroll"/);
  assert.match(panel, /overflow-y-auto/);
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

test("Venezuela and Guyana EEZ geometries are installation context, not transit geofences", () => {
  const installationAsset = readGeoJSON("jwla-034-installations.geojson");
  assert.deepEqual(installationAsset.features.map((feature) => feature.properties?.name).sort(), [
    "JWLA 034 - Guyana Offshore Installation Reference",
    "JWLA 034 - Venezuela Offshore Installation Reference",
  ]);
  for (const feature of installationAsset.features) {
    assert.equal(feature.properties?.scope, "installation-context-only");
    assert.equal(feature.properties?.monitoringMode, "reference-only");
    assert.equal(feature.properties?.contractAlertEligible, false);
    assert.match(feature.properties?.warning || "", /transit|blanket/i);
    assert.ok(turf.booleanValid(feature));
  }
});

test("JWLA-034 GeoJSON assets remain valid and amendment is only the northward delta", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const coastal = readGeoJSON("jwla-034-coastal-waters.geojson");
  const countryAsset = readGeoJSON("jwla-034-countries.geojson");
  const amendments = readGeoJSON("jwla-034-amendments.geojson");
  assert.equal(areas.features.length, 10);
  assert.ok(areas.features.every((feature) => feature.properties?.scope === "defined-waters"));
  assert.ok(fs.statSync(publicPath("jwla-034-reference.geojson")).size < 2_100_000);
  assert.equal(coastal.features.length, 4);
  assert.equal(countryAsset.features.length, 22);
  assert.equal(amendments.features.length, 1);
  const delta = featureByName(amendments, "JWLA 034 Amendment - Red Sea 18N to 25.5N");
  assert.equal(delta.properties?.mapKind, "version-amendment");
  assert.equal(delta.properties?.previousCircular, "JWLA-033");
  assert.equal(delta.properties?.northLimit, 25.5);
  assert.ok(turf.booleanPointInPolygon(turf.point([37.0, 24.5]), delta));
  assert.equal(turf.booleanPointInPolygon(turf.point([35.25, 24.5]), delta), false);
});

test("defined-water reference records amended Red Sea and Cabo includes Tanzania", () => {
  const areas = readGeoJSON("jwla-034-reference.geojson");
  const main = featureByName(areas, "JWLA 034 - Red Sea Added Area 18N to 25.5N");
  const cabo = featureByName(areas, "JWLA 034 - Cabo Delgado");
  assert.equal(main.properties?.redSeaNorthLimit, 25.5);
  assert.equal(main.properties?.excludesEgyptTerritorialWaters, true);
  assert.equal(turf.booleanPointInPolygon(turf.point([35.25, 24.5]), main), false);
  assert.equal(turf.booleanPointInPolygon(turf.point([37.0, 24.5]), main), true);
  assert.equal(turf.booleanPointInPolygon(turf.point([40.48, -10.25]), cabo), true);
});

test("comparison defaults resolve hidden contract and amendment styling metadata", () => {
  assert.deepEqual(getLayerDefaults("JWC War Risk Zone - Persian Gulf"), {
    visible: false, color: "#ef4444", opacity: 0.08,
  });
  assert.deepEqual(getLayerDefaults("JWLA 034 - Red Sea Added Area 18N to 25.5N"), {
    visible: true, color: "#facc15", opacity: 0.22,
  });
});
