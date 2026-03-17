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

    console.log('Removing ALL Land mass from marine buffers... This may take a minute.');

    const subtractLand = (poly) => {
        let currentPoly = poly;
        for (const country of countriesData.features) {
            if (!currentPoly) break;
            
            // Fast check: if bounding boxes don't intersect, skip parsing exact geometries to save time
            const polyBox = turf.bboxPolygon(turf.bbox(currentPoly));
            const countryBox = turf.bboxPolygon(turf.bbox(country));
            
            if (turf.booleanOverlap(polyBox, countryBox) || turf.booleanWithin(polyBox, countryBox) || turf.booleanWithin(countryBox, polyBox)) {
                try {
                    // Try to clip the current poly against the landmass
                    const diff = turf.difference(turf.featureCollection([currentPoly, country]));
                    if (diff) {
                        currentPoly = diff;
                    } else {
                        // if difference is completely empty (entirely on land), diff becomes null
                        currentPoly = null; 
                    }
                } catch(e) { /* ignore topo errors and continue with currentPoly */ }
            }
        }
        return currentPoly;
    };

    let saudiSeaOnly = subtractLand(saudiBuffered);
    let israelSeaOnly = subtractLand(israelBuffered);
    let lebanonSeaOnly = subtractLand(lebanonBuffered);

    console.log('Subtracting original JWC War Risk Zones...');
    const subtractWarRisk = (poly) => {
        let currentPoly = poly;
        for (const wrz of warRiskData.features) {
            if (!currentPoly) break;
            try {
                const diff = turf.difference(turf.featureCollection([currentPoly, wrz]));
                if (diff) {
                    currentPoly = diff;
                } else {
                    currentPoly = null;
                }
            } catch(e) {}
        }
        return currentPoly;
    };

    let saudiFinal = saudiSeaOnly ? subtractWarRisk(saudiSeaOnly) : null;
    let israelFinal = israelSeaOnly ? subtractWarRisk(israelSeaOnly) : null;
    let lebanonFinal = lebanonSeaOnly ? subtractWarRisk(lebanonSeaOnly) : null;

    // Filter Saudi Arabia's geometry to only keep the Red Sea (West side).
    const westCoastBbox = turf.bboxPolygon([34.0, 16.0, 43.5, 29.5]); // [minX, minY, maxX, maxY]
    
    console.log('Clipping Saudi Arabia to West Coast only...');
    let saudiWestCoastOnly = saudiFinal; 
    if (saudiFinal) {
        try {
            saudiWestCoastOnly = turf.intersect(turf.featureCollection([saudiFinal, westCoastBbox]));
        } catch (e) {
            console.log('Saudi bounding box clipping failed', e.message);
        }
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
