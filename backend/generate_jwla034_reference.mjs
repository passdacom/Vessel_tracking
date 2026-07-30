import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as turf from "@turf/turf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const frontendPublic = path.join(root, "frontend", "public");
const outDir = path.join(frontendPublic, "risk-areas");

const CIRCULAR = "JWLA-034";
const PUBLISHED_AT = "2026-07-29";
const SOURCE_URL = "https://lmalloyds.com/wp-content/uploads/2025/06/JWLA-034-Saudi-Arabia.pdf";
const SOURCE_SHA256 = "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9";
const GEOMETRY_SOURCE = "Marine Regions IHO/EEZ reference geometry and geo-countries/Natural Earth-derived boundaries";
const ACCURACY_NOTE = "Reference visualization only; not for navigation or automatic determination of contract coverage.";
const TERRITORIAL_SEA_KM = 22.224;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function firstFeature(relativePath) {
  const data = readJson(relativePath);
  const feature = data.type === "Feature" ? data : data.features?.[0];
  if (!feature) throw new Error(`No feature in ${relativePath}`);
  return feature;
}

function namedFeature(collection, name) {
  const feature = collection.features.find((candidate) => candidate.properties?.name === name);
  if (!feature) throw new Error(`Missing feature: ${name}`);
  return feature;
}

function countryFeature(countries, name) {
  const feature = countries.features.find((candidate) => candidate.properties?.name === name);
  if (!feature) throw new Error(`Missing country: ${name}`);
  return feature;
}

function intersect(a, b, label) {
  const result = turf.intersect(turf.featureCollection([a, b]));
  if (!result) throw new Error(`Empty intersection: ${label}`);
  return result;
}

function difference(a, b, label) {
  const result = turf.difference(turf.featureCollection([a, b]));
  if (!result) throw new Error(`Empty difference: ${label}`);
  return result;
}

function union(features, label) {
  const result = turf.union(turf.featureCollection(features));
  if (!result) throw new Error(`Empty union: ${label}`);
  return result;
}

function withMetadata(feature, name, extra = {}) {
  const {
    stableId = `jwla-034:reference:${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    scope = "reference",
    ...properties
  } = extra;
  return {
    type: "Feature",
    id: stableId,
    geometry: feature.geometry,
    properties: {
      name,
      mapKind: "current-reference",
      contractAlertEligible: false,
      scope,
      circular: CIRCULAR,
      publishedAt: PUBLISHED_AT,
      sourceUrl: SOURCE_URL,
      sourceSha256: SOURCE_SHA256,
      geometrySource: GEOMETRY_SOURCE,
      accuracyNote: ACCURACY_NOTE,
      ...properties,
    },
  };
}

function buildAmendedRedSea(countries) {
  const redSea = firstFeature("backend/iho_red_sea.geojson");
  const southOf255 = turf.bboxPolygon([30, -5, 50, 25.5]);
  const redSeaSouthOf255 = intersect(redSea, southOf255, "Red Sea south of 25.5N");

  // JWLA-034 expressly excludes Egyptian territorial waters. This checked-in reference
  // geometry uses a 12NM buffer around the pinned country boundary and is deliberately
  // labelled approximate; contract alerts need a legally validated territorial-sea source.
  const egypt = countryFeature(countries, "Egypt");
  const egyptBuffer = turf.buffer(egypt, TERRITORIAL_SEA_KM, { units: "kilometers", steps: 32 });
  const egyptTerritorialInRedSea = intersect(egyptBuffer, redSeaSouthOf255, "Egypt territorial reference in Red Sea");
  return difference(redSeaSouthOf255, egyptTerritorialInRedSea, "Red Sea excluding Egypt reference waters");
}

function buildCombinedWaters(countries) {
  const legacy = readJson("frontend/public/war-risk-zone.geojson");
  const oldRedSeaName = "JWC War Risk Zone - Red Sea (S of 18N)";
  const retained = legacy.features.filter((feature) => feature.properties?.name !== oldRedSeaName);
  if (retained.length !== 5) throw new Error(`Expected five retained main-water features, got ${retained.length}`);

  const amendedRedSea = buildAmendedRedSea(countries);
  const combined = union([...retained, amendedRedSea], "JWLA-034 combined waters");
  return withMetadata(combined, "JWLA 034 - Combined Middle East and Southern Red Sea Waters", {
    stableId: "jwla-034:defined-waters:combined-middle-east-southern-red-sea",
    scope: "defined-waters",
    officialCategory: "Defined Waters",
    redSeaNorthLimit: 25.5,
    excludesEgyptTerritorialWaters: true,
    geometryStatus: "approximate-reference",
  });
}

function buildAmendments(countries) {
  const northwardExtensionBand = turf.bboxPolygon([30, 18, 50, 25.5]);
  const northwardExtension = intersect(
    buildAmendedRedSea(countries),
    northwardExtensionBand,
    "JWLA-034 Red Sea northward extension",
  );

  return turf.featureCollection([
    withMetadata(northwardExtension, "JWLA 034 Amendment - Red Sea 18N to 25.5N", {
      stableId: "jwla-034:amendment:red-sea-18n-to-25-5n",
      mapKind: "version-amendment",
      previousCircular: "JWLA-033",
      changeType: "northward-extension",
      scope: "defined-waters-amendment",
      officialCategory: "Defined Waters amendment",
      southLimit: 18,
      northLimit: 25.5,
      excludesEgyptTerritorialWaters: true,
      geometryStatus: "approximate-reference",
    }),
  ]);
}

function buildCaboDelgado(countries) {
  const mozambique = countryFeature(countries, "Mozambique");
  const tanzania = countryFeature(countries, "United Republic of Tanzania");

  const marineBuffers = [mozambique, tanzania].map((country) => {
    const buffered = turf.buffer(country, TERRITORIAL_SEA_KM, { units: "kilometers", steps: 32 });
    return difference(buffered, country, `${country.properties.name} sea buffer`);
  });
  const combinedBuffers = union(marineBuffers, "Mozambique and Tanzania territorial reference");

  // Circular limits: Mnazi Bay / high-seas point in the north and Baia do Lurio /
  // high-seas point in the south. The landward boundary follows the two coastlines.
  const corridor = turf.polygon([[
    [40.315, -10.3266667],
    [40.574, -10.1716667],
    [40.8283333, -13.4995],
    [40.5266667, -13.5],
    [40.315, -10.3266667],
  ]]);
  const cabo = intersect(combinedBuffers, corridor, "Cabo Delgado official limits");
  return withMetadata(cabo, "JWLA 034 - Cabo Delgado", {
    stableId: "jwla-034:defined-waters:cabo-delgado",
    scope: "defined-waters",
    officialCategory: "Defined Waters",
    includesTerritorialSeas: ["Mozambique", "Tanzania"],
    geometryStatus: "approximate-reference",
  });
}

function copyArea(source, sourceName, targetName, extra = {}) {
  return withMetadata(namedFeature(source, sourceName), targetName, {
    geometryStatus: "reference",
    ...extra,
  });
}

function buildAreas(countries) {
  const global = readJson("frontend/public/war-risk-zone-global.geojson");
  return turf.featureCollection([
    buildCombinedWaters(countries),
    copyArea(global, "JWLA 033 - Black Sea & Sea of Azov", "JWLA 034 - Black Sea & Sea of Azov", {
      stableId: "jwla-034:defined-waters:black-sea-azov", scope: "defined-waters", officialCategory: "Defined Waters",
    }),
    copyArea(global, "JWLA 033 - Gulf of Guinea", "JWLA 034 - Gulf of Guinea", {
      stableId: "jwla-034:defined-waters:gulf-of-guinea", scope: "defined-waters", officialCategory: "Defined Waters",
    }),
    buildCaboDelgado(countries),
    copyArea(global, "JWLA 033 - Guyana (Offshore EEZ)", "JWLA 034 - Guyana Offshore Installation Reference", {
      stableId: "jwla-034:installation-context:guyana",
      scope: "installation-context-only",
      officialCategory: "Offshore installation calls",
      monitoringMode: "reference-only",
      warning: "Do not treat simple EEZ transit as a JWC entry event.",
    }),
    copyArea(global, "JWLA 033 - Venezuela (Offshore EEZ)", "JWLA 034 - Venezuela Offshore Installation Reference", {
      stableId: "jwla-034:installation-context:venezuela",
      scope: "installation-context-only",
      officialCategory: "Named Country plus offshore installations",
      monitoringMode: "reference-only",
      warning: "The EEZ is a facility-location reference, not a blanket geofence.",
    }),
  ]);
}

const LISTED_COUNTRIES = [
  "Russia",
  "Bahrain", "Iran", "Iraq", "Israel", "Kuwait", "Lebanon", "Oman", "Qatar", "Saudi Arabia", "Syria", "United Arab Emirates", "Yemen",
  "Djibouti", "Eritrea", "Libya", "Somalia", "Sudan", "Benin", "Nigeria", "Togo",
  "Guyana", "Venezuela",
];

function buildCountries(countries) {
  return turf.featureCollection(LISTED_COUNTRIES.map((name) => {
    const sourceFeature = countryFeature(countries, name);
    const iso3 = sourceFeature.properties?.["ISO3166-1-Alpha-3"];
    if (!iso3) throw new Error(`Missing ISO3 for ${name}`);
    return withMetadata(
      sourceFeature,
      `JWLA 034 Country - ${name}`,
      {
        stableId: `jwla-034:country:${iso3}:land-reference`,
        scope: "named-country-land",
        iso3,
        officialCategory: "Named Country",
        monitoringMode: "reference-outline",
        warning: "Land outline only. The circular defines ports and coastal waters up to 12NM unless specifically varied.",
        geometryStatus: "reference-outline",
      },
    );
  }));
}

function assertValid(collection, label) {
  for (const feature of collection.features) {
    if (!turf.booleanValid(feature)) throw new Error(`${label} invalid geometry: ${feature.properties?.name}`);
  }
}

function main() {
  const countries = readJson("backend/countries.geojson");
  const areas = buildAreas(countries);
  const amendments = buildAmendments(countries);
  const listedCountries = buildCountries(countries);
  assertValid(areas, "areas");
  assertValid(amendments, "amendments");
  assertValid(listedCountries, "countries");

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "jwla-034-reference.geojson"), JSON.stringify(areas));
  fs.writeFileSync(path.join(outDir, "jwla-034-amendments.geojson"), JSON.stringify(amendments));
  fs.writeFileSync(path.join(outDir, "jwla-034-countries.geojson"), JSON.stringify(listedCountries));
  console.log(JSON.stringify({
    circular: CIRCULAR,
    areas: areas.features.length,
    amendments: amendments.features.length,
    countries: listedCountries.features.length,
    files: [
      path.join(outDir, "jwla-034-reference.geojson"),
      path.join(outDir, "jwla-034-amendments.geojson"),
      path.join(outDir, "jwla-034-countries.geojson"),
    ],
  }, null, 2));
}

main();
