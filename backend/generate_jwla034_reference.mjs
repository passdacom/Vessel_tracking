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
];

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
  if (!value || value.version !== 1 || !["prepared", "rolled-back", "committed"].includes(value.phase)) fail();
  if (typeof value.token !== "string" || !/^[0-9]+-[0-9a-f-]{36}$/.test(value.token)) fail();
  if (!Array.isArray(value.entries) || value.entries.length !== OUTPUT_NAMES.length) fail();
  const observedNames = new Set();
  const entries = value.entries.map((entry) => {
    if (!entry || typeof entry.name !== "string" || !OUTPUT_NAMES.includes(entry.name) || observedNames.has(entry.name)) fail();
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
  if (OUTPUT_NAMES.some((name) => !observedNames.has(name))) fail();
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
    writeJournalAtomically({ version: 1, phase: "prepared", token, entries: journalEntries }, token);
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
    writeJournalAtomically({ version: 1, phase: "committed", token, entries: journalEntries }, token);

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
  const countries = readJson("backend/countries.geojson");
  console.log("Building JWLA-034 area references...");
  const areas = buildAreas(countries);
  const coastalWaters = turf.featureCollection(buildCoastalReferences(coastal));
  console.log("Building JWLA-034 amendments...");
  const amendments = buildAmendments(countries);
  console.log("Building JWLA-034 country references...");
  const listedCountries = buildCountries(countries);
  const installations = buildInstallationReferences(areas);
  console.log("Validating JWLA-034 area reference structure...");
  assertWellFormed(areas, "areas");
  console.log("Validating JWLA-034 coastal reference structure...");
  assertWellFormed(coastalWaters, "coastal waters");
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
  ];
  publishOutputsTransactionally(outputs);
  console.log(JSON.stringify({
    circular: CIRCULAR,
    areas: areas.features.length,
    coastalWaters: coastalWaters.features.length,
    amendments: amendments.features.length,
    countries: listedCountries.features.length,
    installations: installations.features.length,
    files: outputs.map(([name]) => path.join(outDir, name)),
  }, null, 2));
}

main();
