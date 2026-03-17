import fs from 'fs';
import * as turf from '@turf/turf';

async function generate12NM() {
  try {
    console.log('Fetching world countries...');
    const countriesResp = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    const countriesData = await countriesResp.json();
    
    // 1. Fetch Marine Regions IHO for Red Sea and Mediterranean Sea
    console.log('Fetching IHO Red Sea...');
    const redSeaResp = await fetch("https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeNames=MarineRegions:iho&cql_filter=name='Red Sea'&outputFormat=application/json");
    const redSeaIho = await redSeaResp.json();
    const redSeaPolygon = redSeaIho.features[0];

    console.log('Fetching IHO Mediterranean Sea...');
    const medSeaResp = await fetch("https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeNames=MarineRegions:iho&cql_filter=name='Mediterranean Sea'&outputFormat=application/json");
    const medSeaIho = await medSeaResp.json();
    const medSeaPolygon = medSeaIho.features[0];

    // Combine Sea Areas (Red Sea + Med Sea) into one MultiPolygon or iterate.
    // For simplicity, we just use them to intersect the 12NM buffers.

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

    console.log('Clipping with Sea Areas to only retain Marine areas...');

    // INTERSECT Buffer with the respective Sea (to remove land overlap)
    // Saudi Arabia -> West coast borders the Red Sea
    let saudiSeaOnly;
    try {
        saudiSeaOnly = turf.intersect(turf.featureCollection([saudiBuffered, redSeaPolygon]));
    } catch(e) {
        console.log('Intersect saudi failed', e);
        saudiSeaOnly = saudiBuffered; // Fallback
    }

    // Israel -> Mediterranean Sea
    let israelSeaOnly;
    try {
        israelSeaOnly = turf.intersect(turf.featureCollection([israelBuffered, medSeaPolygon]));
    } catch(e) {
        console.log('Intersect israel failed', e);
        israelSeaOnly = israelBuffered;
    }

    // Lebanon -> Mediterranean Sea
    let lebanonSeaOnly;
    try {
        lebanonSeaOnly = turf.intersect(turf.featureCollection([lebanonBuffered, medSeaPolygon]));
    } catch(e) {
         console.log('Intersect lebanon failed', e);
         lebanonSeaOnly = lebanonBuffered;
    }

    console.log('Removing Land mass from final marine buffer...');
    // DIFFERENCE: the marine buffer MINUS the original land polygon
    let saudiFinal = turf.difference(turf.featureCollection([saudiSeaOnly, saudi]));
    let israelFinal = turf.difference(turf.featureCollection([israelSeaOnly, israel]));
    let lebanonFinal = turf.difference(turf.featureCollection([lebanonSeaOnly, lebanon]));

    let features = [];
    if(saudiFinal) {
        saudiFinal.properties = { name: 'Saudi Arabia 12NM Territorial Waters (Red Sea)', type: 'HRA' };
        features.push(saudiFinal);
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
    console.log('Successfully generated precise 12nm_bounds.geojson (Sea exclusively)');
  } catch(e) {
    console.error('Error:', e);
  }
}

generate12NM();
