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
// Tier B: IHO 데이터 (Black Sea, Sea of Azov)
// Marine Regions WFS에서 다운로드한 고정밀 데이터 사용
// ─────────────────────────────────────────────
function loadIHO(filename, label) {
  const raw = JSON.parse(readFileSync(filename, "utf-8"));
  const feat = raw.features[0];
  feat.properties = { name: label, source: "Marine Regions IHO" };
  return feat;
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
// Tier D: EEZ 근사 폴리곤 (Venezuela, Guyana)
// JWLA 033: 영해 외측 EEZ 해상 시설
// ─────────────────────────────────────────────
const VENEZUELA_EEZ = turf.feature({
  type: "Polygon",
  coordinates: [[
    [-73.38,  11.80],  // NW (Colombia border area)
    [-72.40,  12.20],
    [-70.00,  13.00],
    [-67.50,  13.20],
    [-65.00,  13.50],
    [-63.00,  13.00],
    [-61.00,  12.00],
    [-60.50,  10.80],
    [-61.00,  10.00],  // SE (Trinidad area)
    [-62.00,   9.50],
    [-63.00,   8.80],
    [-64.50,   8.50],
    [-67.00,   8.50],
    [-70.00,   8.80],
    [-72.00,  10.00],
    [-73.38,  11.80],
  ]]
}, { name: "JWLA 033 - Venezuela (Offshore EEZ)", source: "UNCLOS EEZ approximation" });

const GUYANA_EEZ = turf.feature({
  type: "Polygon",
  coordinates: [[
    [-59.50,   8.50],  // NW
    [-57.50,   9.00],
    [-56.00,   8.80],
    [-56.00,   7.50],
    [-57.00,   6.50],
    [-58.00,   6.00],
    [-59.50,   6.50],
    [-59.80,   7.50],
    [-59.50,   8.50],
  ]]
}, { name: "JWLA 033 - Guyana (Offshore EEZ)", source: "UNCLOS EEZ approximation" });

// Guyana: 영해(12NM) 외측만 — 영해 차감
async function makeGuyanaOffshoreEEZ(countriesData) {
  const guyana = countriesData.features.find(f =>
    JSON.stringify(f.properties).toLowerCase().includes("guyana") &&
    !JSON.stringify(f.properties).toLowerCase().includes("french")
  );
  if (!guyana) { console.log("  [SKIP] Guyana not found"); return GUYANA_EEZ; }

  try {
    const territorial = turf.buffer(guyana, 22.224, { units: "kilometers", steps: 8 });
    const offshore = turf.difference(turf.featureCollection([GUYANA_EEZ, territorial]));
    if (offshore) {
      offshore.properties = { name: "JWLA 033 - Guyana (Offshore EEZ)", source: "UNCLOS EEZ approximation" };
      return offshore;
    }
  } catch (e) {
    console.log("  [WARN] Guyana territorial subtraction failed:", e.message);
  }
  return GUYANA_EEZ;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
  const results = [];

  // ── Tier B: Black Sea & Sea of Azov ──────────
  console.log("\n▶ Tier B: IHO Sea Bodies");
  try {
    const blackSea = loadIHO("./iho_black_sea.geojson", "JWLA 033 - Black Sea");
    results.push(blackSea);
    console.log("  ✅ Black Sea");
  } catch (e) { console.log("  [ERROR] Black Sea:", e.message); }

  try {
    const seaOfAzov = loadIHO("./iho_sea_of_azov.geojson", "JWLA 033 - Sea of Azov");
    results.push(seaOfAzov);
    console.log("  ✅ Sea of Azov");
  } catch (e) { console.log("  [ERROR] Sea of Azov:", e.message); }

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

  // ── Tier D: EEZ Zones ─────────────────────────
  console.log("\n▶ Tier D: EEZ Zones");
  VENEZUELA_EEZ.properties = { name: "JWLA 033 - Venezuela (Offshore EEZ)", source: "UNCLOS EEZ approximation" };
  results.push(VENEZUELA_EEZ);
  console.log("  ✅ Venezuela EEZ");

  const guyana = await makeGuyanaOffshoreEEZ(countriesData);
  results.push(guyana);
  console.log("  ✅ Guyana EEZ");

  // ── Output ─────────────────────────────────────
  const out = JSON.stringify({ type: "FeatureCollection", features: results }, null, 0);
  const outPath = "../frontend/public/war-risk-zone-global.geojson";
  writeFileSync(outPath, out);

  console.log(`\n✅ 완료: ${results.length}개 피처`);
  results.forEach(f => console.log(`   - ${f.properties.name}`));
  console.log(`📁 저장: ${outPath} (${(out.length / 1024).toFixed(0)} KB)`);
}

main().catch(console.error);
