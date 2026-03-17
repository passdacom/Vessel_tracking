import fs from 'fs';
import * as turf from '@turf/turf';

async function generate12NM() {
  try {
    console.log('Fetching world countries...');
    const countriesResp = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
    const countriesData = await countriesResp.json();
    
    console.log('Fetching IHO Red Sea...');
    const redSeaResp = await fetch("https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeNames=MarineRegions:iho&cql_filter=name='Red Sea'&outputFormat=application/json");
    const redSeaIho = await redSeaResp.json();
    const redSeaPolygon = turf.featureCollection(redSeaIho.features);

    console.log('Fetching IHO Mediterranean Sea...');
    const medSeaResp = await fetch("https://geo.vliz.be/geoserver/MarineRegions/wfs?service=WFS&version=1.0.0&request=GetFeature&typeNames=MarineRegions:iho&cql_filter=name='Mediterranean Sea'&outputFormat=application/json");
    const medSeaIho = await medSeaResp.json();
    const medSeaPolygon = turf.featureCollection(medSeaIho.features);

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

    const getIntersect = (poly1, poly2) => {
        let intersection = null;
        try {
            // turf.intersect requires exactly 2 polygons or multipolygons
            intersection = turf.intersect(turf.featureCollection([poly1, poly2.features[0]]));
        } catch(e) {
            console.log('Intersection failed, returning original buffer', e.message);
            intersection = poly1;
        }
        return intersection;
    };

    let saudiSeaOnly = getIntersect(saudiBuffered, redSeaPolygon);
    let israelSeaOnly = getIntersect(israelBuffered, medSeaPolygon);
    let lebanonSeaOnly = getIntersect(lebanonBuffered, medSeaPolygon);

    console.log('Removing Land mass from final marine buffer...');
    // DIFFERENCE: the marine buffer MINUS the original land polygon
    const getDifference = (seaBuffer, landPoly) => {
        let diff = null;
        try {
            diff = turf.difference(turf.featureCollection([seaBuffer, landPoly]));
        } catch(e) {
            console.log('Difference failed, returning sea buffer', e.message);
            diff = seaBuffer;
        }
        return diff;
    };

    let saudiFinal = getDifference(saudiSeaOnly, saudi);
    let israelFinal = getDifference(israelSeaOnly, israel);
    let lebanonFinal = getDifference(lebanonSeaOnly, lebanon);

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
    console.log('Successfully generated extremely precise 12nm_bounds.geojson');
  } catch(e) {
    console.error('Error:', e);
  }
}

generate12NM();
