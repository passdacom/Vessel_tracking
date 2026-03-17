import fs from 'fs';
import tokml from 'tokml';

try {
    const geojson12nmRaw = fs.readFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/12nm_bounds.geojson', 'utf8');
    const geojson12nm = JSON.parse(geojson12nmRaw);
    
    const geojsonWrzRaw = fs.readFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/war-risk-zone.geojson', 'utf8');
    const geojsonWrz = JSON.parse(geojsonWrzRaw);

    // Combine both FeatureCollections
    const combinedFeatures = [...geojsonWrz.features, ...geojson12nm.features];

    // Create a new FeatureCollection
    const combinedGeoJSON = {
        type: "FeatureCollection",
        features: combinedFeatures
    };

    // Add styling: Red with 90% opacity (0.9)
    for (const feature of combinedGeoJSON.features) {
        if (!feature.properties) feature.properties = {};
        feature.properties.stroke = '#ef4444'; // Red stroke
        feature.properties['stroke-width'] = 2; 
        feature.properties['stroke-opacity'] = 0.9;
        feature.properties.fill = '#ef4444';   // Red fill
        feature.properties['fill-opacity'] = 0.9;
        
        // Preserve or override names appropriately
        if (!feature.properties.name) {
            feature.properties.name = 'JWC War Risk Zone';
        }
    }
    
    const kmlString = tokml(combinedGeoJSON, {
        name: 'name',
        description: 'type',
        documentName: 'Combined HRA & Territorial Waters',
        documentDescription: 'Merged JWC War Risk Zone and 12NM Territorial Waters with 90% Opacity',
        simplestyle: true
    });
    
    fs.writeFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/combined_hra_90opacity.kml', kmlString);
    console.log('Successfully generated combined_hra_90opacity.kml');
} catch (e) {
    console.error('Error converting to Combined KML:', e);
}
