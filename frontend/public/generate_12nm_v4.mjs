import fs from 'fs';
import * as turf from '@turf/turf';

async function generate12NM() {
  try {
    console.log('Fetching world countries...');
    const countriesResp = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    const countriesData = await countriesResp.json();
    
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

    console.log('Removing Land mass from final marine buffer...');
    // DIFFERENCE: the marine buffer MINUS the original land polygon
    const getDifference = (bufferPoly, landPoly) => {
        let diff = null;
        try {
            diff = turf.difference(turf.featureCollection([bufferPoly, landPoly]));
        } catch(e) {
            console.log('Difference failed, returning sea buffer', e.message);
            diff = bufferPoly;
        }
        return diff;
    };

    let saudiFinal = getDifference(saudiBuffered, saudi);
    let israelFinal = getDifference(israelBuffered, israel);
    let lebanonFinal = getDifference(lebanonBuffered, lebanon);

    // Filter Saudi Arabia's geometry to only keep the Red Sea (West side).
    // The Red Sea coasts are roughly West of 43 longitude for the northern part, and West of 45 for the southern.
    // An easy geometric way is to clip it with a bounding box covering only the West coast of Saudi Arabia.
    // BBox: minX, minY, maxX, maxY. 
    // Top-left: ~28N, ~34E. Bottom-right: ~16N, ~43E
    const westCoastBbox = turf.bboxPolygon([34.0, 16.0, 43.5, 29.5]); // [minX, minY, maxX, maxY]
    
    console.log('Clipping Saudi Arabia to West Coast only...');
    let saudiWestCoastOnly = saudiFinal; // default
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
