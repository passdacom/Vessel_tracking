import { readFileSync, writeFileSync } from "fs";
import * as turf from "@turf/turf";

const RED_SEA_CLIP = turf.polygon([[
  [30.0, -5.0], [50.0, -5.0], [50.0, 18.0], [30.0, 18.0], [30.0, -5.0]
]]);

const JWC_OCEAN_CLIP = turf.polygon([[
  [35.0, 0.0],             // Inland Africa
  [41.56667, -1.66667],    // 1°40S, 41°34E
  [48.75, -6.75],          // 6°45S, 48°45E
  [60.25, 10.8],           // 10°48N, 60°15E
  [65.0, 10.8],            // 10°48N, 65°E
  [65.0, 30.0],            // North constraint
  [35.0, 30.0],            // Inland West
  [35.0, 0.0]
]]);

const files = [
  {f:"./iho_persian_gulf.geojson",  label:"Persian Gulf", clip: null},
  {f:"./iho_gulf_of_oman.geojson",  label:"Gulf of Oman", clip: null},
  {f:"./iho_gulf_of_aden.geojson",  label:"Gulf of Aden", clip: null},
  {f:"./iho_red_sea.geojson",       label:"Red Sea (S of 18N)", clip: RED_SEA_CLIP},
  {f:"./iho_arabian_sea.geojson",   label:"Arabian Sea (JWC West)", clip: JWC_OCEAN_CLIP},
  {f:"./iho_indian_ocean.geojson",  label:"Indian Ocean (JWC North-West)", clip: JWC_OCEAN_CLIP},
];

const results = [];
for(const {f, label, clip} of files){
  console.log(`\n▶ 처리 중: ${label}...`);
  try {
    const raw = JSON.parse(readFileSync(f,"utf-8"));
    const feat = raw.features[0];
    let clipped;
    
    if (clip) {
      clipped = turf.intersect(turf.featureCollection([feat, clip]));
    } else {
      clipped = feat;
    }
    
    if(!clipped){ 
      console.log("  SKIP (범위 외)"); 
      continue; 
    }
    
    clipped.properties = {name:"JWC War Risk Zone - "+label, source:"Marine Regions IHO"};
    results.push(clipped);
    console.log(`  ✅ 성공 (Geometry Type: ${clipped.geometry.type})`);
  } catch(e){ 
    console.log("  ERROR:",e.message); 
  }
}

// Combine Arabian Sea & Indian Ocean into one feature to make it cleaner?
// Actually keeping them separate is fine, the frontend will just draw 6 polygons.

const out = JSON.stringify({type:"FeatureCollection",features:results});
writeFileSync("../frontend/public/war-risk-zone.geojson", out);
console.log(`\n저장완료: ${results.length}개피처, ${(out.length/1024).toFixed(0)}KB`);
