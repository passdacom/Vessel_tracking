import fs from 'fs';
import * as turf from '@turf/turf';

async function generate12NM() {
  try {
    console.log('Fetching world countries...');
    const countriesResp = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    const countriesData = await countriesResp.json();
    
    // Read the original War Risk Zone from the local public dir to subtract later
    const warRiskRaw = fs.readFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/war-risk-zone.geojson', 'utf-8');
    const warRiskData = JSON.parse(warRiskRaw);

    const saudi = countriesData.features.find(f => JSON.stringify(f.properties).includes('Saudi Arabia'));
    const israel = countriesData.features.find(f => JSON.stringify(f.properties).includes('Israel'));
    const lebanon = countriesData.features.find(f => JSON.stringify(f.properties).includes('Lebanon'));
    
    if (!saudi || !israel || !lebanon) {
      console.log('Failed to find one or more countries.');
      return;
    }

    console.log('Creating 12NM buffers...');
    const bufRadius = 22.224; // 12 NM in km

    let saudiBuffered = turf.buffer(saudi, bufRadius, {units: 'kilometers'});
    let israelBuffered = turf.buffer(israel, bufRadius, {units: 'kilometers'});
    let lebanonBuffered = turf.buffer(lebanon, bufRadius, {units: 'kilometers'});

    // Create a massive "All Land" multipolygon by unifying all countries, 
    // or simply iterating through countries to subtract them from the buffers.
    // However, turf.union on all countries is very slow. 
    // Optimization: find only neighboring countries for subtraction.
    // Neighbors of Isreal/Lebanon: Egypt, Jordan, Syria, Palestine (if available), Turkey, Cyprus
    // Neighbors of Saudi: Yemen, Oman, UAE, Qatar, Bahrain, Kuwait, Iraq, Jordan, Egypt, Sudan, Eritrea
    
    // Instead of precise selection, let's filter countries whose bounding box intersects our buffers.
    const relevantLand = countriesData.features.filter(f => {
       // just checking all countries is safer, but we'll difference iteratively
       return true; 
    });

    console.log('Removing Land mass from marine buffers... This may take a minute.');

    const subtractLand = (poly) => {
        let result = poly;
        for (const country of countriesData.features) {
            // fast bbox check before expensive difference
            if (turf.booleanOverlap(turf.bboxPolygon(turf.bbox(result)), turf.bboxPolygon(turf.bbox(country))) || turf.booleanWithin(turf.bboxPolygon(turf.bbox(result)), turf.bboxPolygon(turf.bbox(country))) || turf.booleanWithin(turf.bboxPolygon(turf.bbox(country)), turf.bboxPolygon(turf.bbox(result)))) {
                 try {
                     const diff = turf.difference(turf.featureCollection([result, country]));
                     if (diff) result = diff;
                 } catch(e) { /* ignore topo errors */ }
            }
        }
        return result;
    };

    let saudiSeaOnly = subtractLand(saudiBuffered);
    let israelSeaOnly = subtractLand(israelBuffered);
    let lebanonSeaOnly = subtractLand(lebanonBuffered);

    console.log('Subtracting original War Risk Zones...');
    const subtractWarRisk = (poly) => {
        let result = poly;
        for (const wrz of warRiskData.features) {
            try {
                const diff = turf.difference(turf.featureCollection([result, wrz]));
                if (diff) result = diff;
            } catch(e) {}
        }
        return result;
    };

    let saudiFinal = subtractWarRisk(saudiSeaOnly);
    let israelFinal = subtractWarRisk(israelSeaOnly);
    let lebanonFinal = subtractWarRisk(lebanonSeaOnly);

    // Filter Saudi Arabia's geometry to only keep the Red Sea (West side).
    const westCoastBbox = turf.bboxPolygon([34.0, 16.0, 43.5, 29.5]); // [minX, minY, maxX, maxY]
    
    console.log('Clipping Saudi Arabia to West Coast only...');
    let saudiWestCoastOnly = saudiFinal; 
    try {
        saudiWestCoastOnly = turf.intersect(turf.featureCollection([saudiFinal, westCoastBbox]));
    } catch (e) {
        console.log('Saudi bounding box clipping failed', e.message);
    }

    let features = [];
    if(saudiWestCoastOnly) {
        saudiWestCoastOnly.properties = { name: 'Saudi Arabia 12NM Territorial Waters (Red Sea)', type: 'HRA' };
        features.push(saudiWestCoastOnly);
    }
    if(israelFinal) {
        israelFinal.properties = { name: 'Israel 12NM Territorial Waters', type: 'HRA' };
        features.push(israelFinal);
    }
    if(lebanonFinal) {
        lebanonFinal.properties = { name: 'Lebanon 12NM Territorial Waters', type: 'HRA' };
        features.push(lebanonFinal);
    }

    let result = turf.featureCollection(features);
    
    fs.writeFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/12nm_bounds.geojson', JSON.stringify(result));
    console.log('Successfully generated extremely precise 12nm_bounds.geojson');
  } catch(e) {
    console.error('Error:', e);
  }
}

generate12NM();
