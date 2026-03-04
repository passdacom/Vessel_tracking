import { readFileSync, writeFileSync } from "fs";
import * as turf from "@turf/turf";

const ARABIAN_CLIP = turf.polygon([[
  [40.0,-10],[65.0,-10],[65.0,30],[40.0,30],[40.0,-10]
]]);
const RED_SEA_CLIP = turf.polygon([[
  [30.0,-5],[50.0,-5],[50.0,18.0],[30.0,18.0],[30.0,-5]
]]);

const files = [
  {f:"./iho_persian_gulf.geojson",  label:"Persian Gulf"},
  {f:"./iho_gulf_of_oman.geojson",  label:"Gulf of Oman"},
  {f:"./iho_gulf_of_aden.geojson",  label:"Gulf of Aden"},
  {f:"./iho_red_sea.geojson",       label:"Red Sea (S of 18N)"},
  {f:"./iho_arabian_sea.geojson",   label:"Arabian Sea (JWC West)"},
];

const results = [];
for(const {f, label} of files){
  console.log(`\n▶ ${label}`);
  const raw = JSON.parse(readFileSync(f,"utf-8"));
  const feat = raw.features[0];
  let clipped;
  try {
    if(label.includes("Red Sea")){
      clipped = turf.intersect(turf.featureCollection([feat, RED_SEA_CLIP]));
    } else if(label.includes("Arabian Sea")){
      clipped = turf.intersect(turf.featureCollection([feat, ARABIAN_CLIP]));
    } else {
      clipped = feat;
    }
    if(!clipped){ console.log("  SKIP"); continue; }
    clipped.properties = {name:"JWC War Risk Zone - "+label, source:"Marine Regions IHO"};
    const g = clipped.geometry;
    const pts = g.type==="Polygon" ? g.coordinates[0].length :
                g.coordinates.reduce((s,r)=>s+r[0].length,0);
    console.log(`  OK: ${g.type} ${pts}pts`);
    results.push(clipped);
  } catch(e){ console.log("  ERROR:",e.message); }
}

const out = JSON.stringify({type:"FeatureCollection",features:results});
writeFileSync("../frontend/public/war-risk-zone.geojson", out);
console.log(`\n저장완료: ${results.length}개피처, ${(out.length/1024).toFixed(0)}KB`);
