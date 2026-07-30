/**
 * JWLA 033 HRA Country Zones Generator
 *
 * JWLA 033에 기재된 국가들의 영토 폴리곤을 추출하여
 * war-risk-countries.geojson 생성
 *
 * 실행: node generate_country_zones.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import * as turf from "@turf/turf";

// ─────────────────────────────────────────────
// JWLA 033 HRA 국가 목록 (사진 기준 전체)
// ─────────────────────────────────────────────
const HRA_COUNTRIES = [
  // ── Russia ───────────────────────────────
  { name: "Russia",               label: "JWLA 033 Country - Russia",               group: "countries-russia",   simplify: 0.05 },

  // ── Middle East ───────────────────────────
  { name: "Bahrain",              label: "JWLA 033 Country - Bahrain",              group: "countries-mideast",  simplify: null },
  { name: "Iran",                 label: "JWLA 033 Country - Iran",                 group: "countries-mideast",  simplify: null },
  { name: "Iraq",                 label: "JWLA 033 Country - Iraq",                 group: "countries-mideast",  simplify: null },
  { name: "Israel",               label: "JWLA 033 Country - Israel",               group: "countries-mideast",  simplify: null },
  { name: "Kuwait",               label: "JWLA 033 Country - Kuwait",               group: "countries-mideast",  simplify: null },
  { name: "Lebanon",              label: "JWLA 033 Country - Lebanon",              group: "countries-mideast",  simplify: null },
  { name: "Oman",                 label: "JWLA 033 Country - Oman",                 group: "countries-mideast",  simplify: null },
  { name: "Qatar",                label: "JWLA 033 Country - Qatar",                group: "countries-mideast",  simplify: null },
  { name: "Saudi Arabia",         label: "JWLA 033 Country - Saudi Arabia",         group: "countries-mideast",  simplify: null },
  { name: "Syria",                label: "JWLA 033 Country - Syria",                group: "countries-mideast",  simplify: null },
  { name: "United Arab Emirates", label: "JWLA 033 Country - United Arab Emirates", group: "countries-mideast",  simplify: null },
  { name: "Yemen",                label: "JWLA 033 Country - Yemen",                group: "countries-mideast",  simplify: null },

  // ── Asia ─────────────────────────────────
  { name: "Pakistan",             label: "JWLA 033 Country - Pakistan",             group: "countries-asia",     simplify: null },

  // ── Africa — East / Red Sea ───────────────
  { name: "Djibouti",             label: "JWLA 033 Country - Djibouti",             group: "countries-africa-e", simplify: null },
  { name: "Eritrea",              label: "JWLA 033 Country - Eritrea",              group: "countries-africa-e", simplify: null },
  { name: "Libya",                label: "JWLA 033 Country - Libya",                group: "countries-africa-e", simplify: null },
  { name: "Mozambique",           label: "JWLA 033 Country - Mozambique (N.)",      group: "countries-africa-e", simplify: null,
    // Cabo Delgado는 모잠비크 북부 — -17°S 이북만
    clipBbox: [30.0, -17.0, 41.0, -10.0] },
  { name: "Somalia",              label: "JWLA 033 Country - Somalia",              group: "countries-africa-e", simplify: null },
  { name: "Sudan",                label: "JWLA 033 Country - Sudan",                group: "countries-africa-e", simplify: null },

  // ── Africa — West / Gulf of Guinea ────────
  { name: "Benin",                label: "JWLA 033 Country - Benin",                group: "countries-africa-w", simplify: null },
  { name: "Nigeria",              label: "JWLA 033 Country - Nigeria",              group: "countries-africa-w", simplify: null },
  { name: "Togo",                 label: "JWLA 033 Country - Togo",                 group: "countries-africa-w", simplify: null },

  // ── South America ─────────────────────────
  { name: "Guyana",               label: "JWLA 033 Country - Guyana",               group: "countries-americas", simplify: null },
  { name: "Venezuela",            label: "JWLA 033 Country - Venezuela",            group: "countries-americas", simplify: null },
];

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
function main() {
  console.log("Loading countries.geojson...");
  const countriesData = JSON.parse(readFileSync("./countries.geojson", "utf-8"));
  console.log(`Loaded ${countriesData.features.length} country features\n`);

  const results = [];

  for (const entry of HRA_COUNTRIES) {
    const { name, label, group, simplify: simplifyTol, clipBbox } = entry;

    // 국가 피처 조회
    const feat = countriesData.features.find(f => f.properties?.name === name);
    if (!feat) {
      console.log(`  [SKIP] Not found: ${name}`);
      continue;
    }

    let processed = JSON.parse(JSON.stringify(feat)); // deep copy

    // 클리핑 (Mozambique 북부 등)
    if (clipBbox) {
      try {
        const clipPoly = turf.bboxPolygon(clipBbox);
        const clipped = turf.intersect(turf.featureCollection([processed, clipPoly]));
        if (clipped) {
          processed = clipped;
          console.log(`  ✂️  Clipped ${name} to bbox [${clipBbox}]`);
        }
      } catch (e) {
        console.log(`  [WARN] ${name}: clip failed — ${e.message}`);
      }
    }

    // 러시아 단순화 (tolerance 0.05° ≈ 5km)
    if (simplifyTol) {
      const before = JSON.stringify(processed).length;
      try {
        const simplified = turf.simplify(processed, { tolerance: simplifyTol, highQuality: false });
        if (simplified) {
          processed = simplified;
          const after = JSON.stringify(processed).length;
          console.log(`  ✂️  Simplified ${name}: ${(before/1024).toFixed(0)}KB → ${(after/1024).toFixed(0)}KB`);
        }
      } catch (e) {
        console.log(`  [WARN] ${name}: simplify failed — ${e.message}`);
      }
    }

    processed.properties = { name: label, group, source: "Natural Earth / geo-countries" };
    results.push(processed);

    const sizeKB = (JSON.stringify(processed).length / 1024).toFixed(1);
    console.log(`  ✅ ${label} (${sizeKB} KB)`);
  }

  const output = {
    type: "FeatureCollection",
    features: results,
  };

  const outPath = "../frontend/public/war-risk-countries.geojson";
  writeFileSync(outPath, JSON.stringify(output));
  const totalKB = (JSON.stringify(output).length / 1024).toFixed(1);

  console.log(`\n✅ 완료: ${results.length}개 국가, ${totalKB} KB`);
  results.forEach(f => console.log(`   - ${f.properties.name}`));
}

main();
