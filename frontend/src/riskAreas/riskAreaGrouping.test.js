import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  JWLA_033_COMPARISON_KEY,
  RISK_AREA_SECTIONS,
  allRiskAreaItems,
  groupSectionItems,
  isComparisonModeEnabled,
  migrateRiskAreaSettings,
  setComparisonMode,
} from "./riskAreaCatalog.js";

const bySection = (id) => RISK_AREA_SECTIONS.find((section) => section.id === id);

test("JWLA-034 is one top-level group classified by official meaning", () => {
  const jwla = bySection("jwla-034");
  assert.ok(jwla);
  assert.equal(jwla.label, "JWLA-034 Listed Areas");
  assert.deepEqual(jwla.subsections.map(({ id, label, items }) => [id, label, items.length]), [
    ["jwla-034-defined-waters", "Defined Waters", 10],
    ["jwla-034-named-countries", "JWLA-034 Named Countries", 22],
    ["jwla-034-special-call-only", "Special Call-Only Areas", 1],
  ]);

  const deprecatedTopLevelIds = [
    "jwc-034-current",
    "jwc-034-provisional-coastal",
    "jwc-034-precision-references",
    "contract-alerts",
    "jwc-034-amendment",
    "jwc-installations",
    "jwc-countries",
  ];
  assert.ok(deprecatedTopLevelIds.every((id) => !bySection(id)));
});

test("Venezuela is one named-country row with 12NM coastal waters and installation context, while Guyana is call-only", () => {
  const jwla = bySection("jwla-034");
  const countries = jwla.subsections.find(({ id }) => id === "jwla-034-named-countries");
  const special = jwla.subsections.find(({ id }) => id === "jwla-034-special-call-only");
  const iraq = countries.items.find(({ label }) => label === "Iraq");
  assert.match(iraq.note, /12NM.*Iraqi offshore oil terminals/i);
  assert.match(iraq.note, /manual review/i);

  const venezuela = countries.items.find(({ label }) => label === "Venezuela");
  const guyana = special.items.find(({ label }) => label.startsWith("Guyana"));

  assert.deepEqual(venezuela.layerKeys, [
    "JWLA 034 Coastal Waters - Venezuela 12NM",
    "JWLA 034 - Venezuela Offshore Installation Reference",
  ]);
  assert.match(venezuela.note, /ports.*12NM.*offshore installations.*EEZ/i);
  assert.match(venezuela.note, /EEZ.*not.*blanket|EEZ.*not.*area/i);

  assert.deepEqual(guyana.layerKeys, ["JWLA 034 - Guyana Offshore Installation Reference"]);
  assert.match(guyana.note, /only to calls.*beyond territorial waters/i);
  assert.ok(guyana.layerKeys.every((layerKey) => !/12NM/.test(layerKey)));
});

test("geometry quality is item metadata rather than a top-level group", () => {
  const labels = RISK_AREA_SECTIONS.map(({ label }) => label);
  assert.ok(labels.every((label) => !/Provisional|Precision|Added Area|Baseline Areas/.test(label)));
  const countries = bySection("jwla-034").subsections.find(({ id }) => id === "jwla-034-named-countries").items;
  assert.equal(countries.find(({ label }) => label === "Russia").geometryStatus, "verified");
  assert.equal(countries.find(({ label }) => label === "Venezuela").geometryStatus, "provisional");
  assert.equal(countries.find(({ label }) => label === "Israel").geometryStatus, "existing-baseline");
  assert.equal(countries.find(({ label }) => label === "Lebanon").geometryStatus, "existing-baseline");
  assert.ok(countries.every(({ defaultVisible }) => defaultVisible));
  assert.ok(countries.every(({ layerKeys }) => layerKeys.every((key) => !key.startsWith("JWLA 034 Country - "))));

  const defined = bySection("jwla-034").subsections.find(({ id }) => id === "jwla-034-defined-waters").items;
  assert.ok([...defined, ...countries].every((areaItem) => areaItem.precisionReferenceStatus === undefined));
  assert.ok([...defined, ...countries].every((areaItem) => !/precision reference/i.test(areaItem.note || "")));
});

test("JWLA-033 comparison is one default-off gate that preserves legacy child settings", () => {
  const legacy = {
    "JWC War Risk Zone - Persian Gulf": { visible: true, color: "#123456", opacity: 0.2 },
  };
  const migrated = migrateRiskAreaSettings(legacy);
  assert.equal(migrated[JWLA_033_COMPARISON_KEY], false);
  assert.equal(isComparisonModeEnabled(migrated), false);
  assert.deepEqual(migrated["JWC War Risk Zone - Persian Gulf"], legacy["JWC War Risk Zone - Persian Gulf"]);

  const enabled = setComparisonMode(migrated, true);
  assert.equal(isComparisonModeEnabled(enabled), true);
  assert.equal(enabled["JWC War Risk Zone - Persian Gulf"].visible, true);
  assert.equal(setComparisonMode(enabled, false)[JWLA_033_COMPARISON_KEY], false);

  const legacyVenezuela = migrateRiskAreaSettings({
    "JWLA 034 Country - Venezuela": { visible: true, color: "#123456", opacity: 0.2 },
  });
  for (const layerKey of [
    "JWLA 034 Coastal Waters - Venezuela 12NM",
    "JWLA 034 - Venezuela Offshore Installation Reference",
  ]) {
    assert.equal(legacyVenezuela[layerKey].visible, true);
  }
  assert.equal(legacyVenezuela["JWLA 034 Coastal Waters - Venezuela 12NM"].color, "#123456");
});

test("current defined waters expose individually styled 034 subregions including the added area", () => {
  const defined = bySection("jwla-034").subsections.find(({ id }) => id === "jwla-034-defined-waters").items;
  assert.deepEqual(defined.map(({ label, group }) => [label, group]), [
    ["Persian Gulf (PG)", "Middle East & Southern Red Sea"],
    ["Gulf of Oman (GOO)", "Middle East & Southern Red Sea"],
    ["Gulf of Aden", "Middle East & Southern Red Sea"],
    ["Red Sea south of 18°N", "Middle East & Southern Red Sea"],
    ["JWLA-034 Added Area · Red Sea 18°N–25.5°N", "Middle East & Southern Red Sea"],
    ["Arabian Sea (JWC West)", "Middle East & Southern Red Sea"],
    ["Indian Ocean (JWC North-West)", "Middle East & Southern Red Sea"],
    ["Black Sea & Sea of Azov", "Black Sea & Sea of Azov"],
    ["Gulf of Guinea", "Gulf of Guinea"],
    ["Cabo Delgado", "Cabo Delgado"],
  ]);
  assert.equal(new Set(defined.map(({ color }) => color)).size, defined.length);
  assert.ok(defined.every(({ defaultVisible }) => defaultVisible));
  assert.deepEqual(groupSectionItems({ items: defined }).map(({ label, items }) => [label, items.length]), [
    ["Middle East & Southern Red Sea", 7],
    ["Black Sea & Sea of Azov", 1],
    ["Gulf of Guinea", 1],
    ["Cabo Delgado", 1],
  ]);
});

test("panel exposes one JWLA-033 comparison control and no implementation-status groups", () => {
  const source = fs.readFileSync(new URL("./AreaPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /JWLA-033과 비교/);
  assert.match(source, /setComparisonMode/);
  assert.doesNotMatch(source, /JWLA-034 Provisional Coastal References/);
  assert.doesNotMatch(source, /JWLA-034 Precision References/);
  assert.doesNotMatch(source, /JWLA-034 Added Area/);
});

test("allRiskAreaItems flattens JWLA subsections for shared visibility helpers", () => {
  const items = allRiskAreaItems();
  assert.ok(items.some(({ id }) => id === "jwc-034-current-persian-gulf"));
  assert.ok(items.some(({ id }) => id === "jwc-country-venezuela"));
  assert.ok(items.some(({ id }) => id === "jwc-guyana-installations"));
});

test("map mounts only visible current, coastal, installation and comparison features", () => {
  const source = fs.readFileSync(new URL("../components/Map/RestrictedZone.jsx", import.meta.url), "utf8");
  assert.match(source, /visibleFeatureCollection/);
  assert.match(source, /data=\{visibleAreas\}/);
  assert.match(source, /data=\{visibleCoastal\}/);
  assert.match(source, /data=\{visibleProvisionalCoastal\}/);
  assert.match(source, /data=\{visibleInstallations\}/);
  assert.match(source, /data=\{visibleContractAlerts\}/);
});
