import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
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
const COASTAL_SOURCE = "backend/reference-data/marine-regions-territorial-seas-v4-syr-rus.geojson";
const COASTAL_MANIFEST = "backend/reference-data/marine-regions-territorial-seas-v4-syr-rus.manifest.json";
const REVIEWED_COASTAL_SOURCE_SHA256 = "00b007a2a76df5b7a59fc8349c0184d1f561da12c3cec5f5acf65d5f10ad4a6f";
const PROVISIONAL_COASTAL_SOURCE = "backend/reference-data/marine-regions-territorial-seas-v4-jwla034-remaining.geojson";
const PROVISIONAL_COASTAL_MANIFEST = "backend/reference-data/marine-regions-territorial-seas-v4-jwla034-remaining.manifest.json";
const PROVISIONAL_COASTAL_SOURCE_SHA256 = "055c17d26b7aa7814708d3d73b7110571349303a93a5bc12d9475da31fdcdbdd";
const PRECISION_SOURCE = "backend/reference-data/jwla-034-precision-references.source.geojson";
const PRECISION_MANIFEST = "backend/reference-data/jwla-034-precision-references.manifest.json";
const PRECISION_SUBSET = "backend/reference-data/natural-earth-v5.1.2-jwla034-precision-subsets.geojson";
const PRECISION_SOURCE_SHA256 = "1b18b7248d47e3c4db53cb2cb80be635dcca781149ec6aabfeea4bf9ce164f22";
const PRECISION_MANIFEST_SHA256 = "3bbb5fca57b73d43ed2ab7a583ee2b7ede10d9769030854cf36eb19e332aa800";
const PRECISION_SUBSET_SHA256 = "cb1cd8304062373c48610be14bcd6b8f63389bb66cff10a8f9e3b74727b7bef9";
const NATURAL_EARTH_PRECISION_PROVENANCE = Object.freeze({
  version: "v5.1.2",
  tagCommit: "f1890d9f152c896d250a77557a5751a93d494776",
  oceanUrl: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_ocean.geojson",
  admin0CountriesUrl: "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson",
  license: "Public domain",
  licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
});
const PRECISION_IDS = [
  "jwla-034:precision:black-sea-azov-marine",
  "jwla-034:precision:gulf-of-guinea-water",
  "jwla-034:precision:iran-caspian-12nm",
];
const PRECISION_GEOMETRY_STATUSES = [
  "derived-marine-reference-inland-waters-excluded",
  "derived-water-only-reference",
  "provisional-derived-12nm-reference",
];
const MARINE_REGIONS_PROVENANCE = Object.freeze({
  dataset: "World 12 Nautical Miles Zone (Territorial Seas)",
  version: "v4",
  publishedAt: "2023-10-25",
  doi: "https://doi.org/10.14284/633",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  sourceUrl: "https://www.marineregions.org/downloads.php",
  wfsEndpoint: "https://geo.vliz.be/geoserver/MarineRegions/ows",
  retrievalScript: "backend/scripts/fetch-marine-regions-territorial-seas.mjs --provisional",
});
const PROVISIONAL_FEATURES = [
  [49081, "BHR", "Bahraini 12 NM"], [49183, "IRN", "Iranian 12 NM"],
  [49184, "IRQ", "Iraqi 12 NM"], [49098, "ISR", "Israeli 12 NM"],
  [49080, "KWT", "Kuwaiti 12 NM"], [49097, "LBN", "Lebanese 12 NM"],
  [49077, "OMN", "Omani 12 NM"], [49182, "QAT", "Qatari 12 NM"],
  [49079, "SAU", "Saudi Arabian 12 NM"], [49083, "ARE", "Emirati 12 NM"],
  [49076, "YEM", "Yemeni 12 NM"], [49075, "DJI", "Djiboutian 12 NM"],
  [49074, "ERI", "Eritrean 12 NM"], [49095, "LBY", "Libyan 12 NM"],
  [49073, "SOM", "Somali 12 NM"], [49078, "SDN", "Sudanese 12 NM"],
  [49113, "BEN", "Beninese 12 NM"], [49188, "NGA", "Nigerian 12 NM"],
  [49112, "TGO", "Togolese 12 NM"], [49150, "VEN", "Venezuelan 12 NM"],
];
const PROVISIONAL_RENDERED_MRGIDS = [
  49081, 49183, 49184, 49080, 49077, 49182, 49079, 49083, 49076,
  49075, 49074, 49095, 49073, 49078, 49113, 49188, 49112, 49150,
];
const PROVISIONAL_WITHHELD = [
  [49098, "ISR", "Israeli 12 NM", "source geometry fails turf.booleanValid; manual review required"],
  [49097, "LBN", "Lebanese 12 NM", "source geometry fails turf.booleanValid; manual review required"],
];
const HASH_SCOPE = "sourceDocumentSha256 hashes raw official circular PDF bytes; sourceArtifactSha256 hashes raw pinned geometry artifact bytes when present";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function loadVerifiedCoastalSource() {
  const sourceBytes = fs.readFileSync(path.join(root, COASTAL_SOURCE));
  const manifest = readJson(COASTAL_MANIFEST);
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  if (digest !== REVIEWED_COASTAL_SOURCE_SHA256) {
    throw new Error(`Pinned coastal source hash does not match reviewed trust anchor: ${digest}`);
  }
  if (digest !== manifest.artifactSha256) {
    throw new Error(`Pinned coastal source hash does not match manifest: ${digest}`);
  }
  const source = JSON.parse(sourceBytes);
  if (source.type !== "FeatureCollection" || source.features?.length !== manifest.features?.length) {
    throw new Error("Pinned coastal source does not match manifest feature count");
  }
  const observed = source.features.map((feature) => ({
    mrgid: feature.properties?.mrgid,
    iso3: feature.properties?.iso_ter1,
    geoname: feature.properties?.geoname,
  }));
  if (JSON.stringify(observed) !== JSON.stringify(manifest.features)) {
    throw new Error("Pinned coastal source feature metadata does not match manifest");
  }
  return { source, manifest };
}

function loadProvisionalCoastalSource() {
  const sourceBytes = fs.readFileSync(path.join(root, PROVISIONAL_COASTAL_SOURCE));
  const digest = createHash("sha256").update(sourceBytes).digest("hex");
  if (digest !== PROVISIONAL_COASTAL_SOURCE_SHA256) {
    throw new Error(`Pinned provisional coastal source hash does not match trust anchor: ${digest}`);
  }
  const manifest = readJson(PROVISIONAL_COASTAL_MANIFEST);
  if (manifest.artifactSha256 !== digest || manifest.reviewStatus !== "provisional-display-only"
      || Object.entries(MARINE_REGIONS_PROVENANCE).some(([key, value]) => manifest[key] !== value)) {
    throw new Error("Pinned provisional coastal manifest provenance does not match generator contract");
  }
  const expectedFeatures = PROVISIONAL_FEATURES.map(([mrgid, iso3, geoname]) => ({ mrgid, iso3, geoname }));
  if (JSON.stringify(manifest.features) !== JSON.stringify(expectedFeatures)
      || JSON.stringify(manifest.renderedMrgids) !== JSON.stringify(PROVISIONAL_RENDERED_MRGIDS)) {
    throw new Error("Pinned provisional coastal manifest feature order or render policy is unexpected");
  }
  const expectedWithheld = PROVISIONAL_WITHHELD.map(([mrgid, iso3, geoname, reason]) => ({ mrgid, iso3, geoname, reason }));
  if (JSON.stringify(manifest.withheldFeatures) !== JSON.stringify(expectedWithheld)) {
    throw new Error("Pinned provisional coastal manifest withheld policy is unexpected");
  }
  const source = JSON.parse(sourceBytes);
  const observed = source.features?.map((feature) => [
    feature.properties?.mrgid, feature.properties?.iso_ter1, feature.properties?.geoname,
  ]);
  if (source.type !== "FeatureCollection" || JSON.stringify(observed) !== JSON.stringify(PROVISIONAL_FEATURES)) {
    throw new Error("Pinned provisional coastal source metadata or order is unexpected");
  }
  const rendered = new Set(PROVISIONAL_RENDERED_MRGIDS);
  const withheld = new Set(PROVISIONAL_WITHHELD.map(([mrgid]) => mrgid));
  for (const feature of source.features) {
    const mrgid = feature.properties.mrgid;
    if ((rendered.has(mrgid) && withheld.has(mrgid)) || (!rendered.has(mrgid) && !withheld.has(mrgid))) {
      throw new Error(`Provisional coastal render policy mismatch for MRGID ${mrgid}`);
    }
  }
  // The exact artifact hash is the runtime trust boundary. Expensive topology validation
  // is exercised once in the generator contract suite, not on every deterministic build
  // or crash-recovery probe; assertWellFormed still enforces coordinate/ring structure.
  return { source, manifest };
}

function loadPrecisionSource() {
  const artifactBytes = fs.readFileSync(path.join(root, PRECISION_SOURCE));
  const manifestBytes = fs.readFileSync(path.join(root, PRECISION_MANIFEST));
  const subsetBytes = fs.readFileSync(path.join(root, PRECISION_SUBSET));
  const artifactDigest = createHash("sha256").update(artifactBytes).digest("hex");
  const manifestDigest = createHash("sha256").update(manifestBytes).digest("hex");
  const subsetDigest = createHash("sha256").update(subsetBytes).digest("hex");
  if (artifactDigest !== PRECISION_SOURCE_SHA256 || manifestDigest !== PRECISION_MANIFEST_SHA256
      || subsetDigest !== PRECISION_SUBSET_SHA256) {
    throw new Error("Pinned precision artifact, manifest, or subset hash does not match its trust anchor");
  }
  const manifest = JSON.parse(manifestBytes);
  const artifact = JSON.parse(artifactBytes);
  const exactManifestContract = manifest.schemaVersion === 1
    && manifest.dataset === "JWLA-034 precision references"
    && manifest.reviewStatus === "manual-review-display-only"
    && manifest.manualReviewRequired === true
    && manifest.artifact === PRECISION_SOURCE
    && manifest.artifactSha256 === PRECISION_SOURCE_SHA256
    && manifest.sourceSubset === PRECISION_SUBSET
    && manifest.sourceSubsetSha256 === PRECISION_SUBSET_SHA256
    && manifest.sourceSha256?.officialCircular === SOURCE_SHA256
    && manifest.sourceSha256?.naturalEarthOcean === "f9696a1337c746a0f6c8c13bc60d0f230d2ef8d105198d5657726c8f8e763fc2"
    && manifest.sourceSha256?.naturalEarthAdmin0Countries === "239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255"
    && manifest.officialCircular?.reference === CIRCULAR
    && manifest.officialCircular?.publishedAt === PUBLISHED_AT
    && manifest.officialCircular?.url === SOURCE_URL
    && Object.entries(NATURAL_EARTH_PRECISION_PROVENANCE).every(([key, value]) => manifest.naturalEarth?.[key] === value)
    && manifest.retrievalRecipe === "python3 backend/scripts/derive-jwla034-precision-references.py --refresh-sources"
    && manifest.offlineRecipe === "python3 backend/scripts/derive-jwla034-precision-references.py"
    && manifest.algorithm?.iranCaspianBufferMeters === 22_224
    && manifest.algorithm?.bufferQuadSegs === 32
    && /nine-anchor.*Natural Earth.*no inland-water/i.test(manifest.algorithm?.blackSeaAzov || "")
    && /official.*Natural Earth.*ocean/i.test(manifest.algorithm?.gulfOfGuinea || "")
    && /project Iran.*buffer Iran.*subtract Iran.*intersect Caspian.*EPSG:4326/i.test(manifest.algorithm?.iranCaspian || "");
  if (!exactManifestContract) throw new Error("Pinned precision manifest provenance or derivation recipe is unexpected");
  if (artifact.type !== "FeatureCollection" || JSON.stringify(artifact.features?.map(({ id }) => id)) !== JSON.stringify(PRECISION_IDS)
      || JSON.stringify(manifest.features?.map(({ id }) => id)) !== JSON.stringify(PRECISION_IDS)) {
    throw new Error("Pinned precision feature identity or order is unexpected");
  }
  for (let index = 0; index < PRECISION_IDS.length; index += 1) {
    const sourceFeature = artifact.features[index];
    const manifestFeature = manifest.features[index];
    if (sourceFeature.properties?.geometryStatus !== PRECISION_GEOMETRY_STATUSES[index]
        || manifestFeature.geometryStatus !== PRECISION_GEOMETRY_STATUSES[index]
        || sourceFeature.properties?.monitoringMode !== "reference-only"
        || sourceFeature.properties?.contractAlertEligible !== false
        || sourceFeature.properties?.manualReviewRequired !== true
        || manifestFeature.monitoringMode !== "reference-only"
        || manifestFeature.contractAlertEligible !== false
        || manifestFeature.manualReviewRequired !== true
        || !Array.isArray(manifestFeature.limitations) || manifestFeature.limitations.length !== 2) {
      throw new Error(`Pinned precision metadata or limitations are unexpected for ${PRECISION_IDS[index]}`);
    }
  }
  if (!/inland waters.*excluded|excluded.*inland waters/i.test(manifest.features[0].limitations.join(" "))
      || !/Natural Earth.*coastline generalization/i.test(manifest.features[1].limitations.join(" "))
      || !/not an authoritative.*territorial-sea boundary/i.test(manifest.features[2].limitations.join(" "))
      || !/manual review is required/i.test(manifest.features[2].limitations.join(" "))) {
    throw new Error("Pinned precision feature limitations do not match the reviewed contract");
  }
  return { artifact, manifest, artifactDigest, manifestDigest };
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
      hashAlgorithm: "SHA-256",
      hashScope: HASH_SCOPE,
      sourceDocumentSha256: SOURCE_SHA256,
      sourceArtifactSha256: null,
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

function buildCoastalReferences(coastal) {
  const labels = new Map([
    [49096, "Syria"],
    [49031, "Russia"],
  ]);
  return coastal.source.features.map((feature) => {
    const mrgid = feature.properties.mrgid;
    const iso3 = feature.properties.iso_ter1;
    const countryName = labels.get(mrgid);
    if (!countryName) throw new Error(`Unexpected coastal feature MRGID: ${mrgid}`);
    return withMetadata(feature, `JWLA 034 Coastal Waters - ${countryName} 12NM`, {
      stableId: `jwla-034:coastal:${iso3}:12nm`,
      scope: "named-country-coastal-waters",
      officialCategory: "Named Country coastal waters",
      monitoringMode: "reference-only",
      geometryStatus: "reference-only",
      marineRegionsMrgid: mrgid,
      sourceDatasetVersion: coastal.manifest.version,
      sourceUrl: coastal.manifest.wfsEndpoint,
      sourceSha256: coastal.manifest.artifactSha256,
      sourceArtifactSha256: REVIEWED_COASTAL_SOURCE_SHA256,
      geometrySource: `${coastal.manifest.dataset} ${coastal.manifest.version}`,
      license: coastal.manifest.license,
      licenseUrl: coastal.manifest.licenseUrl,
      attribution: "Marine Regions / Flanders Marine Institute (VLIZ)",
      subsetStatus: "reviewed-subset",
      derivedStatus: "derived-display-reference",
    });
  });
}

function buildProvisionalCoastalReferences(coastal) {
  const labels = new Map([
    [49081, "Bahrain"], [49183, "Iran"], [49184, "Iraq"], [49080, "Kuwait"],
    [49077, "Oman"], [49182, "Qatar"], [49079, "Saudi Arabia"], [49083, "United Arab Emirates"],
    [49076, "Yemen"], [49075, "Djibouti"], [49074, "Eritrea"], [49095, "Libya"],
    [49073, "Somalia"], [49078, "Sudan"], [49113, "Benin"], [49188, "Nigeria"],
    [49112, "Togo"], [49150, "Venezuela"],
  ]);
  const byMrgid = new Map(coastal.source.features.map((feature) => [feature.properties.mrgid, feature]));
  return PROVISIONAL_RENDERED_MRGIDS.map((mrgid) => {
    const feature = byMrgid.get(mrgid);
    const countryName = labels.get(mrgid);
    if (!feature || !countryName) {
      throw new Error(`Cannot render provisional coastal feature MRGID ${mrgid}`);
    }
    const iso3 = feature.properties.iso_ter1;
    return withMetadata(feature, `JWLA 034 Coastal Waters - ${countryName} 12NM`, {
      stableId: `jwla-034:coastal:${iso3}:12nm`,
      scope: "named-country-coastal-waters",
      officialCategory: "Named Country coastal waters",
      monitoringMode: "reference-only",
      geometryStatus: "provisional-reference-only",
      marineRegionsMrgid: mrgid,
      sourceDatasetVersion: coastal.manifest.version,
      sourceUrl: coastal.manifest.wfsEndpoint,
      sourceSha256: coastal.manifest.artifactSha256,
      sourceArtifactSha256: PROVISIONAL_COASTAL_SOURCE_SHA256,
      geometrySource: `${coastal.manifest.dataset} ${coastal.manifest.version}`,
      doi: coastal.manifest.doi,
      license: coastal.manifest.license,
      licenseUrl: coastal.manifest.licenseUrl,
      attribution: "Marine Regions / Flanders Marine Institute (VLIZ)",
      subsetStatus: "provisional-unreviewed-subset",
      derivedStatus: "provisional-display-reference",
      manualReviewRequired: true,
    });
  });
}

function buildPrecisionReferences(precision) {
  const names = [
    "JWLA 034 Precision Reference - Black Sea and Sea of Azov Marine Waters",
    "JWLA 034 Precision Reference - Gulf of Guinea Water Only",
    "JWLA 034 Precision Reference - Iran Caspian 12NM Provisional",
  ];
  return turf.featureCollection(precision.artifact.features.map((feature, index) => ({
    type: "Feature",
    id: PRECISION_IDS[index],
    geometry: feature.geometry,
    properties: {
      name: names[index],
      mapKind: "precision-reference-display-only",
      scope: "precision-reference",
      circular: CIRCULAR,
      publishedAt: PUBLISHED_AT,
      monitoringMode: "reference-only",
      contractAlertEligible: false,
      manualReviewRequired: true,
      geometryStatus: PRECISION_GEOMETRY_STATUSES[index],
      reviewStatus: "manual-review-display-only",
      sourceUrl: SOURCE_URL,
      sourceDocumentSha256: SOURCE_SHA256,
      sourceArtifactSha256: precision.artifactDigest,
      sourceManifestSha256: precision.manifestDigest,
      sourceSubsetSha256: PRECISION_SUBSET_SHA256,
      hashAlgorithm: "SHA-256",
      hashScope: precision.manifest.hashScope,
      geometrySource: "JWLA-034 official limits independently intersected with Natural Earth v5.1.2 cartographic geometry",
      naturalEarthVersion: NATURAL_EARTH_PRECISION_PROVENANCE.version,
      naturalEarthTagCommit: NATURAL_EARTH_PRECISION_PROVENANCE.tagCommit,
      naturalEarthOceanUrl: NATURAL_EARTH_PRECISION_PROVENANCE.oceanUrl,
      naturalEarthAdmin0CountriesUrl: NATURAL_EARTH_PRECISION_PROVENANCE.admin0CountriesUrl,
      license: NATURAL_EARTH_PRECISION_PROVENANCE.license,
      licenseUrl: NATURAL_EARTH_PRECISION_PROVENANCE.licenseUrl,
      limitations: precision.manifest.features[index].limitations,
      accuracyNote: ACCURACY_NOTE,
    },
  })));
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
      geometryRole: "installation-context-only",
      detectionMode: "facility-visit-manual-review",
      manualReviewRequired: true,
      marineRegionsMrgid: 8460,
      warning: "Do not treat simple EEZ transit as a JWC entry event.",
    }),
    copyArea(global, "JWLA 033 - Venezuela (Offshore EEZ)", "JWLA 034 - Venezuela Offshore Installation Reference", {
      stableId: "jwla-034:installation-context:venezuela",
      scope: "installation-context-only",
      officialCategory: "Named Country plus offshore installations",
      monitoringMode: "reference-only",
      geometryRole: "installation-context-only",
      detectionMode: "facility-visit-manual-review",
      manualReviewRequired: true,
      marineRegionsMrgid: 8433,
      warning: "The EEZ is a facility-location reference, not a blanket geofence.",
    }),
  ]);
}

const LISTED_COUNTRIES = [
  "Russia",
  "Bahrain", "Iran", "Iraq", "Israel", "Kuwait", "Lebanon", "Oman", "Qatar", "Saudi Arabia", "Syria", "United Arab Emirates", "Yemen",
  "Djibouti", "Eritrea", "Libya", "Somalia", "Sudan", "Benin", "Nigeria", "Togo",
  "Venezuela",
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

function buildInstallationReferences(areas) {
  const names = new Set([
    "JWLA 034 - Guyana Offshore Installation Reference",
    "JWLA 034 - Venezuela Offshore Installation Reference",
  ]);
  const features = areas.features.filter((feature) => names.has(feature.properties?.name));
  if (features.length !== names.size) {
    throw new Error(`Expected ${names.size} installation reference features, found ${features.length}`);
  }
  return turf.featureCollection(features);
}

function assertWellFormed(collection, label) {
  const visitPolygon = (polygon, featureName) => {
    if (!Array.isArray(polygon) || polygon.length === 0) throw new Error(`${label} empty polygon: ${featureName}`);
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error(`${label} short ring: ${featureName}`);
      for (const coordinate of ring) {
        const [lon, lat] = coordinate || [];
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          throw new Error(`${label} invalid coordinate: ${featureName}`);
        }
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) throw new Error(`${label} unclosed ring: ${featureName}`);
    }
  };

  for (const feature of collection.features) {
    const featureName = feature.properties?.name;
    if (feature.geometry?.type === "Polygon") {
      visitPolygon(feature.geometry.coordinates, featureName);
    } else if (feature.geometry?.type === "MultiPolygon") {
      for (const polygon of feature.geometry.coordinates) visitPolygon(polygon, featureName);
    } else {
      throw new Error(`${label} unsupported geometry: ${featureName}`);
    }
  }
}

const TRANSACTION_JOURNAL_NAME = ".jwla-034-generation-transaction.json";
const OUTPUT_NAMES = [
  "jwla-034-reference.geojson",
  "jwla-034-coastal-waters.geojson",
  "jwla-034-amendments.geojson",
  "jwla-034-countries.geojson",
  "jwla-034-installations.geojson",
  "jwla-034-coastal-waters-provisional.geojson",
  "jwla-034-precision-references.geojson",
];
const LEGACY_V1_OUTPUT_NAMES = OUTPUT_NAMES.slice(0, 5);
const LEGACY_V2_OUTPUT_NAMES = OUTPUT_NAMES.slice(0, 6);
const JOURNAL_VERSION = 3;

function fsyncDirectory(directory) {
  const fd = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeAndFsync(filePath, bytes) {
  const fd = fs.openSync(filePath, "wx", 0o644);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeJournalAtomically(journal, token) {
  const journalPath = path.join(outDir, TRANSACTION_JOURNAL_NAME);
  const temporaryPath = path.join(outDir, `${TRANSACTION_JOURNAL_NAME}.tmp-${token}-${randomUUID()}`);
  try {
    writeAndFsync(temporaryPath, Buffer.from(JSON.stringify(journal)));
    fs.renameSync(temporaryPath, journalPath);
    fsyncDirectory(outDir);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function validateJournal(value) {
  const fail = () => { throw new Error("Invalid JWLA-034 transaction journal"); };
  if (!value || ![1, 2, JOURNAL_VERSION].includes(value.version) || !["prepared", "rolled-back", "committed"].includes(value.phase)) fail();
  if (typeof value.token !== "string" || !/^[0-9]+-[0-9a-f-]{36}$/.test(value.token)) fail();
  const expectedOutputNames = value.version === 1
    ? LEGACY_V1_OUTPUT_NAMES
    : value.version === 2 ? LEGACY_V2_OUTPUT_NAMES : OUTPUT_NAMES;
  if (!Array.isArray(value.entries) || value.entries.length !== expectedOutputNames.length) fail();
  const observedNames = new Set();
  const entries = value.entries.map((entry) => {
    if (!entry || typeof entry.name !== "string" || !expectedOutputNames.includes(entry.name) || observedNames.has(entry.name)) fail();
    observedNames.add(entry.name);
    const expected = {
      finalName: entry.name,
      stageName: `${entry.name}.stage-${value.token}`,
      backupName: `${entry.name}.backup-${value.token}`,
      restoreName: `${entry.name}.restore-${value.token}`,
    };
    if (typeof entry.existed !== "boolean") fail();
    for (const [key, expectedName] of Object.entries(expected)) {
      if (entry[key] !== expectedName || path.basename(entry[key]) !== entry[key]) fail();
    }
    return {
      ...entry,
      finalPath: path.join(outDir, entry.finalName),
      stagePath: path.join(outDir, entry.stageName),
      backupPath: path.join(outDir, entry.backupName),
      restorePath: path.join(outDir, entry.restoreName),
    };
  });
  if (expectedOutputNames.some((name) => !observedNames.has(name))) fail();
  return { ...value, entries };
}

function removeIfPresent(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function recoverExistingTransaction() {
  fs.mkdirSync(outDir, { recursive: true });
  const journalPath = path.join(outDir, TRANSACTION_JOURNAL_NAME);
  if (!fs.existsSync(journalPath)) return;

  let journal;
  try {
    journal = validateJournal(JSON.parse(fs.readFileSync(journalPath, "utf8")));
  } catch (error) {
    throw new Error("Cannot recover malformed JWLA-034 transaction journal; outputs were not touched", { cause: error });
  }

  if (journal.phase === "prepared") {
    for (const entry of journal.entries) {
      if (entry.existed && !fs.existsSync(entry.backupPath)) {
        throw new Error(`Cannot recover JWLA-034 transaction: missing backup for ${entry.name}`);
      }
    }
    for (const entry of journal.entries) {
      if (entry.existed) {
        removeIfPresent(entry.restorePath);
        fs.copyFileSync(entry.backupPath, entry.restorePath, fs.constants.COPYFILE_EXCL);
        const restoreFd = fs.openSync(entry.restorePath, "r");
        try { fs.fsyncSync(restoreFd); } finally { fs.closeSync(restoreFd); }
        fs.renameSync(entry.restorePath, entry.finalPath);
      } else {
        removeIfPresent(entry.finalPath);
      }
    }
    fsyncDirectory(outDir);
    // Recovery is now durable. Mark it before deleting backups so a crash during
    // cleanup is re-entrant and never requires an already-removed backup.
    writeJournalAtomically({
      version: journal.version,
      phase: "rolled-back",
      token: journal.token,
      entries: journal.entries.map(({ name, finalName, stageName, backupName, restoreName, existed }) => ({
        name, finalName, stageName, backupName, restoreName, existed,
      })),
    }, journal.token);
    journal.phase = "rolled-back";
  }

  const injectedCleanupAfter = process.env.NODE_ENV === "test"
    ? Number.parseInt(process.env.JWLA034_TEST_SIGKILL_AFTER_RECOVERY_CLEANUPS || "", 10)
    : Number.NaN;
  let cleanupCount = 0;
  for (const entry of journal.entries) {
    removeIfPresent(entry.stagePath);
    removeIfPresent(entry.backupPath);
    removeIfPresent(entry.restorePath);
    cleanupCount += 1;
    fsyncDirectory(outDir);
    if (Number.isInteger(injectedCleanupAfter) && injectedCleanupAfter > 0 && cleanupCount === injectedCleanupAfter) {
      process.kill(process.pid, "SIGKILL");
    }
  }
  fsyncDirectory(outDir);
  fs.unlinkSync(journalPath);
  fsyncDirectory(outDir);
}

function publishOutputsTransactionally(outputs) {
  fs.mkdirSync(outDir, { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const entries = outputs.map(([name, collection]) => {
    const finalName = name;
    return {
      name,
      finalName,
      stageName: `${name}.stage-${token}`,
      backupName: `${name}.backup-${token}`,
      restoreName: `${name}.restore-${token}`,
      finalPath: path.join(outDir, finalName),
      stagePath: path.join(outDir, `${name}.stage-${token}`),
      backupPath: path.join(outDir, `${name}.backup-${token}`),
      restorePath: path.join(outDir, `${name}.restore-${token}`),
      existed: fs.existsSync(path.join(outDir, finalName)),
      bytes: Buffer.from(JSON.stringify(collection)),
    };
  });
  const journalEntries = entries.map(({ name, finalName, stageName, backupName, restoreName, existed }) => ({
    name, finalName, stageName, backupName, restoreName, existed,
  }));
  const injectedAfter = process.env.NODE_ENV === "test"
    ? Number.parseInt(process.env.JWLA034_TEST_SIGKILL_AFTER_REPLACEMENTS || "", 10)
    : Number.NaN;
  let journalPrepared = false;

  try {
    for (const entry of entries) writeAndFsync(entry.stagePath, entry.bytes);
    for (const entry of entries) {
      if (!entry.existed) continue;
      fs.copyFileSync(entry.finalPath, entry.backupPath, fs.constants.COPYFILE_EXCL);
      const backupFd = fs.openSync(entry.backupPath, "r");
      try { fs.fsyncSync(backupFd); } finally { fs.closeSync(backupFd); }
    }
    fsyncDirectory(outDir);
    writeJournalAtomically({ version: JOURNAL_VERSION, phase: "prepared", token, entries: journalEntries }, token);
    journalPrepared = true;

    let replacementCount = 0;
    for (const entry of entries) {
      fs.renameSync(entry.stagePath, entry.finalPath);
      replacementCount += 1;
      fsyncDirectory(outDir);
      if (Number.isInteger(injectedAfter) && injectedAfter > 0 && replacementCount === injectedAfter) {
        process.kill(process.pid, "SIGKILL");
      }
    }
    fsyncDirectory(outDir);
    writeJournalAtomically({ version: JOURNAL_VERSION, phase: "committed", token, entries: journalEntries }, token);

    for (const entry of entries) {
      removeIfPresent(entry.stagePath);
      removeIfPresent(entry.backupPath);
      removeIfPresent(entry.restorePath);
    }
    fsyncDirectory(outDir);
    fs.unlinkSync(path.join(outDir, TRANSACTION_JOURNAL_NAME));
    fsyncDirectory(outDir);
  } catch (error) {
    if (journalPrepared || fs.existsSync(path.join(outDir, TRANSACTION_JOURNAL_NAME))) {
      try {
        recoverExistingTransaction();
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], "JWLA-034 publication failed and durable recovery was incomplete");
      }
    } else {
      for (const entry of entries) {
        removeIfPresent(entry.stagePath);
        removeIfPresent(entry.backupPath);
        removeIfPresent(entry.restorePath);
      }
      fsyncDirectory(outDir);
    }
    throw error;
  }
}

function main() {
  recoverExistingTransaction();
  // Verify every pinned input before constructing or replacing any generated output.
  const coastal = loadVerifiedCoastalSource();
  const provisionalCoastal = loadProvisionalCoastalSource();
  const precision = loadPrecisionSource();
  const countries = readJson("backend/countries.geojson");
  console.log("Building JWLA-034 area references...");
  const allAreaReferences = buildAreas(countries);
  const coastalWaters = turf.featureCollection(buildCoastalReferences(coastal));
  const provisionalCoastalWaters = turf.featureCollection(buildProvisionalCoastalReferences(provisionalCoastal));
  const precisionReferences = buildPrecisionReferences(precision);
  console.log("Building JWLA-034 amendments...");
  const amendments = buildAmendments(countries);
  console.log("Building JWLA-034 country references...");
  const listedCountries = buildCountries(countries);
  const installations = buildInstallationReferences(allAreaReferences);
  const areas = turf.featureCollection(
    allAreaReferences.features.filter((feature) => feature.properties?.scope === "defined-waters"),
  );
  if (areas.features.length !== 4) {
    throw new Error(`Expected 4 JWLA-034 defined-water features, found ${areas.features.length}`);
  }
  console.log("Validating JWLA-034 area reference structure...");
  assertWellFormed(areas, "areas");
  console.log("Validating JWLA-034 coastal reference structure...");
  assertWellFormed(coastalWaters, "coastal waters");
  console.log("Validating JWLA-034 provisional coastal reference structure...");
  assertWellFormed(provisionalCoastalWaters, "provisional coastal waters");
  console.log("Validating JWLA-034 precision reference structure...");
  assertWellFormed(precisionReferences, "precision references");
  console.log("Validating JWLA-034 amendment structure...");
  assertWellFormed(amendments, "amendments");
  console.log("Validating JWLA-034 country reference structure...");
  assertWellFormed(listedCountries, "countries");
  console.log("Validating JWLA-034 installation reference structure...");
  assertWellFormed(installations, "installations");

  const outputs = [
    ["jwla-034-reference.geojson", areas],
    ["jwla-034-coastal-waters.geojson", coastalWaters],
    ["jwla-034-amendments.geojson", amendments],
    ["jwla-034-countries.geojson", listedCountries],
    ["jwla-034-installations.geojson", installations],
    ["jwla-034-coastal-waters-provisional.geojson", provisionalCoastalWaters],
    ["jwla-034-precision-references.geojson", precisionReferences],
  ];
  publishOutputsTransactionally(outputs);
  console.log(JSON.stringify({
    circular: CIRCULAR,
    areas: areas.features.length,
    coastalWaters: coastalWaters.features.length,
    amendments: amendments.features.length,
    countries: listedCountries.features.length,
    installations: installations.features.length,
    provisionalCoastalWaters: provisionalCoastalWaters.features.length,
    precisionReferences: precisionReferences.features.length,
    files: outputs.map(([name]) => path.join(outDir, name)),
  }, null, 2));
}

main();
