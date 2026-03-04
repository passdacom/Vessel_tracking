import { readFileSync } from "fs";
import * as turf from "@turf/turf";

const data = JSON.parse(readFileSync("../frontend/public/war-risk-zone.geojson", "utf-8"));

console.log("=== JWC 구역 좌표 검증(Bounding Box) ===");
for (const feat of data.features) {
  const name = feat.properties.name.replace("JWC War Risk Zone - ", "");
  const bbox = turf.bbox(feat);
  const minLng = bbox[0].toFixed(5);
  const minLat = bbox[1].toFixed(5);
  const maxLng = bbox[2].toFixed(5);
  const maxLat = bbox[3].toFixed(5);
  
  console.log(`\n▶ ${name}`);
  console.log(`  경도(Longitude) 범위: ${minLng} ~ ${maxLng}`);
  console.log(`  위도(Latitude)  범위: ${minLat} ~ ${maxLat}`);
  
  if (name.includes("Red Sea")) {
    if (parseFloat(maxLat) <= 18.0) console.log("  [검증 성공] 북위 18° 이하로 정확히 클리핑됨!");
    else console.log("  [검증 실패] 북위 18° 초과!!");
  }
  if (name.includes("Arabian Sea")) {
    if (parseFloat(maxLng) <= 65.0) console.log("  [검증 성공] 동경 65° 이하로 정확히 클리핑됨!");
    else console.log("  [검증 실패] 동경 65° 초과!!");
  }
}
