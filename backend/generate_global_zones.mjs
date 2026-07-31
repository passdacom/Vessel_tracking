/**
 * JWLA 033 Global War Risk Zones Generator
 *
 * 기존 clip_jwc_v2.mjs (중동 구역) 패턴을 글로벌 JWLA 033 구역에 적용.
 * 출력: ../frontend/public/war-risk-zone-global.geojson
 *
 * 실행: node generate_global_zones.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import * as turf from "@turf/turf";

const JWLA_CURRENT_SOURCE_URL = "https://lmalloyds.com/wp-content/uploads/2025/06/JWLA-034-Saudi-Arabia.pdf";
const JWLA_CURRENT_SOURCE_SHA256 = "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9";
const BLACK_SEA_SOUTHERN_BOUNDARY = [
  [29.7654833, 45.1809667],
  [29.8523333, 45.18725],
  [29.9927167, 45.1912333],
  [30.0401333, 45.0892333],
  [30.9787, 44.7770833],
  [31.17495, 44.7374],
  [31.4100333, 44.04795],
  [31.3325667, 43.4515167],
  [40.0099833, 43.3854333],
];

// ─────────────────────────────────────────────
// Tier A: Gulf of Guinea — JWLA 033 명시 좌표
// NW: 6°06'45"N, 1°12'E  SW: 0°40'S, 3°E  SE: 0°40'S, 8°42'E (Cape Lopez)
// 북쪽 경계는 토고→베냉→나이지리아→카메룬→적도기니→가봉 해안선 트레이스
// ─────────────────────────────────────────────
const GULF_OF_GUINEA = turf.feature({
  type: "Polygon",
  coordinates: [[
    [1.20,  6.1125],   // Togo coast (NW anchor, 6°06'45"N, 1°12'E)
    [1.78,  6.27],     // Benin west coast
    [2.69,  6.37],     // Benin coast (Cotonou)
    [3.38,  6.46],     // Nigeria (Lagos)
    [4.30,  6.36],
    [5.10,  5.50],     // Nigeria (creeks start)
    [6.00,  4.87],     // Niger Delta west
    [6.84,  4.35],     // Niger Delta
    [7.43,  4.31],     // Niger Delta east
    [8.35,  4.60],     // Nigeria east coast
    [8.67,  4.52],     // Cameroon border
    [9.23,  4.04],     // Cameroon coast
    [9.77,  3.85],     // Cameroon (Douala area)
    [9.92,  3.50],
    [9.84,  2.94],
    [9.65,  2.29],     // Equatorial Guinea
    [9.51,  1.64],
    [9.37,  1.00],     // Equatorial Guinea (Bata)
    [9.26,  0.60],
    [9.09,  0.28],     // Gabon border
    [8.72, -0.00],     // Gabon coast
    [8.70, -0.6667],   // SE corner: 0°40'S, 8°42'E (Cape Lopez)
    [3.00, -0.6667],   // SW corner: 0°40'S, 3°E
    [1.20,  6.1125],   // Close back to NW anchor
  ]]
}, { name: "JWLA 033 - Gulf of Guinea", source: "JWLA 033 explicit coordinates" });

// ─────────────────────────────────────────────
// Tier B: IHO 데이터 (Black Sea + Sea of Azov)
// JWLA 033: "Black Sea and Sea of Azov (all waters plus inland waters)"
// → 두 IHO 데이터를 union하여 단일 구역으로 생성
// Marine Regions WFS에서 다운로드한 고정밀 데이터 사용
// ─────────────────────────────────────────────
function loadIHO(filename, label) {
  const raw = JSON.parse(readFileSync(filename, "utf-8"));
  const feat = raw.features[0];
  feat.properties = { name: label, source: "Marine Regions IHO" };
  return feat;
}

function makeBlackSeaAndAzov() {
  console.log("  Loading Black Sea IHO data...");
  const blackSea = loadIHO("./iho_black_sea.geojson", "JWLA 033 - Black Sea & Sea of Azov");
  console.log("  Loading Sea of Azov IHO data...");
  const seaOfAzov = loadIHO("./iho_sea_of_azov.geojson", "JWLA 033 - Black Sea & Sea of Azov");

  console.log("  Merging Black Sea + Sea of Azov (turf.union)...");
  let merged;
  try {
    merged = turf.union(turf.featureCollection([blackSea, seaOfAzov]));
    if (!merged) throw new Error("union returned null");
  } catch (e) {
    console.log("  [WARN] Union failed, using Black Sea only:", e.message);
    merged = blackSea;
  }

  // ── JWLA-033/034 공식 경계 적용 ───────────────────────────────────────
  // 공식 좌표선의 북쪽 수역만 포함한다. 이전 구현은 남쪽 배제 polygon을
  // 40°0.599'E에서 바로 닫아 그보다 동쪽인 조지아/터키 연안 수역을 남겼다.
  console.log("  Applying official JWLA Black Sea boundary...");
  const officialWatersEnvelope = turf.polygon([[
    ...BLACK_SEA_SOUTHERN_BOUNDARY,
    [45, BLACK_SEA_SOUTHERN_BOUNDARY.at(-1)[1]],
    [45, 50],
    [20, 50],
    [20, BLACK_SEA_SOUTHERN_BOUNDARY[0][1]],
    BLACK_SEA_SOUTHERN_BOUNDARY[0],
  ]]);

  const clipped = turf.intersect(turf.featureCollection([merged, officialWatersEnvelope]));
  if (!clipped) throw new Error("Official JWLA Black Sea boundary produced an empty geometry");
  clipped.properties = {
    name: "JWLA 033 - Black Sea & Sea of Azov",
    source: "Marine Regions IHO clipped to the official JWLA defined-water boundary",
    sourceDocument: "JWLA-033 (3 March 2026), unchanged in JWLA-034 (29 July 2026)",
    sourceUrl: JWLA_CURRENT_SOURCE_URL,
    sourceSha256: JWLA_CURRENT_SOURCE_SHA256,
    geometryStatus: "official-coordinate boundary clipped to IHO water bodies",
    officialBoundaryCoordinates: BLACK_SEA_SOUTHERN_BOUNDARY,
  };
  return clipped;
}

// ─────────────────────────────────────────────
// Tier C: 국가 12NM 버퍼 생성
// 기존 generate_12nm_v7.mjs 패턴과 동일
// ─────────────────────────────────────────────
async function fetchCountries() {
  // 로컬에 미리 다운로드된 파일 사용 (wget으로 사전 다운로드 필요)
  // wget -O countries.geojson "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
  try {
    console.log("  Loading local countries.geojson...");
    return JSON.parse(readFileSync("./countries.geojson", "utf-8"));
  } catch {
    console.log("  Falling back to fetch...");
    const resp = await fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson");
    return resp.json();
  }
}

function subtractLandOptimized(poly, countriesData) {
  let current = poly;
  const polyBox = turf.bbox(current);

  for (const country of countriesData.features) {
    if (!current) break;
    const countryBox = turf.bbox(country);
    // bbox overlap check (fast pre-filter)
    if (
      countryBox[2] < polyBox[0] || countryBox[0] > polyBox[2] ||
      countryBox[3] < polyBox[1] || countryBox[1] > polyBox[3]
    ) continue;

    try {
      const diff = turf.difference(turf.featureCollection([current, country]));
      if (diff) current = diff;
      else current = null;
    } catch (e) { /* ignore topology errors */ }
  }
  return current;
}

async function make12NMZone(countriesData, countryName, label, clipBbox) {
  // 정확한 이름 매칭 우선, 없으면 포함 검색
  const country =
    countriesData.features.find(f => f.properties?.name === countryName) ||
    countriesData.features.find(f =>
      JSON.stringify(f.properties).toLowerCase().includes(countryName.toLowerCase())
    );
  if (!country) { console.log(`  [SKIP] Country not found: ${countryName}`); return null; }

  console.log(`  Buffering ${countryName}...`);
  let buffered = turf.buffer(country, 22.224, { units: "kilometers", steps: 8 });

  // 클리핑 박스를 먼저 적용하여 처리 영역 축소 → subtractLand 효율화 및 안정성 향상
  if (clipBbox) {
    const clipPoly = turf.bboxPolygon(clipBbox);
    try {
      const clippedFirst = turf.intersect(turf.featureCollection([buffered, clipPoly]));
      if (clippedFirst) buffered = clippedFirst;
      else { console.log(`  [SKIP] ${countryName}: no area in clip bbox`); return null; }
    } catch (e) {
      console.log(`  [WARN] ${countryName}: pre-clip failed - ${e.message}`);
    }
  }

  console.log(`  Subtracting land for ${countryName}...`);
  let seaOnly = subtractLandOptimized(buffered, countriesData);
  if (!seaOnly) { console.log(`  [SKIP] ${countryName}: no sea area after subtraction`); return null; }

  seaOnly.properties = { name: label, source: "12NM buffer from country boundary" };
  console.log(`  ✅ ${label}`);
  return seaOnly;
}

// ─────────────────────────────────────────────
// Tier D: EEZ context geometry (Venezuela, Guyana)
// Marine Regions geometry is useful for locating offshore installations, but the
// circular does not define either entire EEZ as a transit-triggered risk area.
// ─────────────────────────────────────────────
function withInstallationContextMetadata(feature, {
  name,
  mrgid,
  officialRule,
}) {
  feature.properties = {
    name,
    source: "Marine Regions EEZ",
    sourceDocument: "JWLA-033 (3 March 2026), unchanged in JWLA-034 (29 July 2026)",
    sourceUrl: JWLA_CURRENT_SOURCE_URL,
    sourceSha256: JWLA_CURRENT_SOURCE_SHA256,
    marineRegionsMrgid: mrgid,
    geometryRole: "installation-context-only",
    detectionMode: "facility-visit-manual-review",
    manualReviewRequired: true,
    backendDetectionMismatch: true,
    officialRule,
    warning: "EEZ transit alone is not a definitive JWC entry event; installation-call evidence and manual review are required.",
  };
  return feature;
}

// Venezuela: Marine Regions EEZ (Feature mrgid:8433 "Venezuelan Exclusive Economic Zone")
// 레퍼런스 기준 클리핑: 북쪽 과도한 확장(16.75°N) 및 동쪽 Essequibo 분쟁 구역(-58.82°W) 제거
function loadVenezuelaEEZ() {
  const raw = JSON.parse(readFileSync("./eez_venezuela.geojson", "utf-8"));
  // 2개 피처 중 본토 EEZ 선택 (west < -71 → mrgid:8433 "Venezuelan EEZ")
  let feat = raw.features.find(f => turf.bbox(f)[0] < -71);
  if (!feat) feat = raw.features[0];

  // 레퍼런스 이미지 기준 클리핑:
  //   동쪽: -61°W (Trinidad 경계, Essequibo 분쟁 구역 제외)
  //   북쪽: 14°N (실제 EEZ 북단 - Aves Island 포함하되 Dominican Republic EEZ 제외)
  const clipBox = turf.bboxPolygon([-74.0, 7.0, -61.0, 14.0]);
  try {
    const clipped = turf.intersect(turf.featureCollection([feat, clipBox]));
    if (clipped) {
      return withInstallationContextMetadata(clipped, {
        name: "JWLA 033 - Venezuela (Offshore EEZ)",
        mrgid: 8433,
        officialRule: "Venezuela, including all offshore installations in the Venezuelan EEZ; named-country defaults cover ports and coastal waters up to 12NM.",
      });
    }
  } catch (e) {
    console.log("  [WARN] Venezuela EEZ clip failed:", e.message);
  }
  return withInstallationContextMetadata(feat, {
    name: "JWLA 033 - Venezuela (Offshore EEZ)",
    mrgid: 8433,
    officialRule: "Venezuela, including all offshore installations in the Venezuelan EEZ; named-country defaults cover ports and coastal waters up to 12NM.",
  });
}

// Guyana: Marine Regions 공식 EEZ + 12NM 영해 차감
// Feature mrgid:8460 "Guyanese Exclusive Economic Zone"
async function loadGuyanaOffshoreEEZ(countriesData) {
  const raw = JSON.parse(readFileSync("./eez_guyana.geojson", "utf-8"));
  // 2개 피처 중 본토 EEZ 선택 (west < -58.9 → mrgid:8460 "Guyanese EEZ")
  let feat = raw.features.find(f => turf.bbox(f)[0] < -58.9);
  if (!feat) feat = raw.features[0];

  // JWLA 033: "beyond territorial waters only" → 12NM 영해 차감
  const guyana = countriesData.features.find(f => f.properties?.name === "Guyana");
  if (guyana) {
    try {
      const territorial = turf.buffer(guyana, 22.224, { units: "kilometers", steps: 8 });
      const offshore = turf.difference(turf.featureCollection([feat, territorial]));
      if (offshore) {
        return withInstallationContextMetadata(offshore, {
          name: "JWLA 033 - Guyana (Offshore EEZ)",
          mrgid: 8460,
          officialRule: "Guyana, but only calls to offshore installations in the Guyanese EEZ beyond territorial waters.",
        });
      }
    } catch (e) {
      console.log("  [WARN] Guyana territorial subtraction failed:", e.message);
    }
  }
  return withInstallationContextMetadata(feat, {
    name: "JWLA 033 - Guyana (Offshore EEZ)",
    mrgid: 8460,
    officialRule: "Guyana, but only calls to offshore installations in the Guyanese EEZ beyond territorial waters.",
  });
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const results = [];

  // ── Tier B: Black Sea & Sea of Azov (단일 구역) ──
  console.log("\n▶ Tier B: Black Sea & Sea of Azov (merged, JWLA 033 single zone)");
  try {
    const blackSeaAzov = makeBlackSeaAndAzov();
    results.push(blackSeaAzov);
    console.log("  ✅ Black Sea & Sea of Azov (merged)");
  } catch (e) { console.log("  [ERROR] Black Sea & Sea of Azov:", e.message); }

  // ── Tier A: Gulf of Guinea ────────────────────
  console.log("\n▶ Tier A: Gulf of Guinea (JWLA 033 explicit coordinates)");
  results.push(GULF_OF_GUINEA);
  console.log("  ✅ Gulf of Guinea");

  // ── Tier C: Country 12NM Zones ────────────────
  console.log("\n▶ Tier C: Country 12NM Coastal Zones");
  let countriesData;
  try {
    countriesData = await fetchCountries();
    console.log(`  Loaded ${countriesData.features.length} country features`);
  } catch (e) {
    console.error("  [ERROR] Failed to fetch countries:", e.message);
    process.exit(1);
  }

  // Libya - 지중해 연안 (Gulf of Sirte 포함)
  const libya = await make12NMZone(countriesData, "Libya", "JWLA 033 - Libya (Coastal 12NM)",
    [9.0, 29.5, 26.0, 33.5]);
  if (libya) results.push(libya);

  // Sudan - 홍해 연안 (Sudan bbox: 21.8~38.6°E, 8.7~22.2°N)
  const sudan = await make12NMZone(countriesData, "Sudan", "JWLA 033 - Sudan (Red Sea Coastal)",
    [35.5, 16.5, 41.0, 23.5]);
  if (sudan) results.push(sudan);

  // Eritrea - 18°N 이남 (홍해)
  const eritrea = await make12NMZone(countriesData, "Eritrea", "JWLA 033 - Eritrea (S of 18N)",
    [37.5, 11.0, 43.5, 18.0]);
  if (eritrea) results.push(eritrea);

  // Djibouti
  const djibouti = await make12NMZone(countriesData, "Djibouti", "JWLA 033 - Djibouti (Coastal)",
    [41.5, 10.5, 43.7, 12.7]);
  if (djibouti) results.push(djibouti);

  // Somalia - 전 해안선 (아덴만 + 인도양)
  const somalia = await make12NMZone(countriesData, "Somalia", "JWLA 033 - Somalia (Coastal)",
    [40.5, -2.0, 51.5, 12.5]);
  if (somalia) results.push(somalia);

  // Cabo Delgado / Northern Mozambique
  const mozambique = await make12NMZone(countriesData, "Mozambique", "JWLA 033 - Cabo Delgado / N.Mozambique",
    [39.0, -13.5, 41.5, -10.0]);
  if (mozambique) results.push(mozambique);

  // Nigeria - Gulf of Guinea 내 해안
  const nigeria = await make12NMZone(countriesData, "Nigeria", "JWLA 033 - Nigeria (Coastal 12NM)",
    [2.5, 3.5, 15.0, 7.0]);
  if (nigeria) results.push(nigeria);

  // Benin
  const benin = await make12NMZone(countriesData, "Benin", "JWLA 033 - Benin (Coastal 12NM)",
    [1.0, 5.5, 3.0, 7.0]);
  if (benin) results.push(benin);

  // Togo
  const togo = await make12NMZone(countriesData, "Togo", "JWLA 033 - Togo (Coastal 12NM)",
    [0.5, 5.5, 2.0, 7.0]);
  if (togo) results.push(togo);

  // ── Tier D: EEZ Zones (Marine Regions 공식 경계) ─
  console.log("\n▶ Tier D: EEZ Zones (Marine Regions official boundaries)");
  try {
    const venezuela = loadVenezuelaEEZ();
    results.push(venezuela);
    const vbb = turf.bbox(venezuela);
    console.log(`  ✅ Venezuela EEZ (bbox: [${vbb.map(v => v.toFixed(2)).join(", ")}])`);
  } catch (e) { console.log("  [ERROR] Venezuela EEZ:", e.message); }

  try {
    const guyana = await loadGuyanaOffshoreEEZ(countriesData);
    results.push(guyana);
    const gbb = turf.bbox(guyana);
    console.log(`  ✅ Guyana EEZ (bbox: [${gbb.map(v => v.toFixed(2)).join(", ")}])`);
  } catch (e) { console.log("  [ERROR] Guyana EEZ:", e.message); }

  // ── Output ─────────────────────────────────────
  const requiredNames = [
    "JWLA 033 - Black Sea & Sea of Azov",
    "JWLA 033 - Gulf of Guinea",
    "JWLA 033 - Libya (Coastal 12NM)",
    "JWLA 033 - Sudan (Red Sea Coastal)",
    "JWLA 033 - Eritrea (S of 18N)",
    "JWLA 033 - Djibouti (Coastal)",
    "JWLA 033 - Somalia (Coastal)",
    "JWLA 033 - Cabo Delgado / N.Mozambique",
    "JWLA 033 - Nigeria (Coastal 12NM)",
    "JWLA 033 - Benin (Coastal 12NM)",
    "JWLA 033 - Togo (Coastal 12NM)",
    "JWLA 033 - Venezuela (Offshore EEZ)",
    "JWLA 033 - Guyana (Offshore EEZ)",
  ];
  const names = new Set(results.map((feature) => feature.properties?.name));
  const missing = requiredNames.filter((name) => !names.has(name));
  if (missing.length > 0 || results.length !== requiredNames.length) {
    throw new Error(`Refusing partial global-zone output; missing=${missing.join(", ") || "none"}, count=${results.length}/${requiredNames.length}`);
  }
  const criticalGeometryNames = new Set([
    "JWLA 033 - Black Sea & Sea of Azov",
    "JWLA 033 - Venezuela (Offshore EEZ)",
    "JWLA 033 - Guyana (Offshore EEZ)",
  ]);
  for (const feature of results.filter((candidate) => criticalGeometryNames.has(candidate.properties?.name))) {
    if (!turf.booleanValid(feature)) {
      throw new Error(`Refusing invalid global-zone geometry: ${feature.properties?.name}`);
    }
  }

  const out = JSON.stringify({ type: "FeatureCollection", features: results }, null, 0);
  const outPath = "../frontend/public/war-risk-zone-global.geojson";
  writeFileSync(outPath, out);

  console.log(`\n✅ 완료: ${results.length}개 피처`);
  results.forEach(f => console.log(`   - ${f.properties.name}`));
  console.log(`📁 저장: ${outPath} (${(out.length / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
