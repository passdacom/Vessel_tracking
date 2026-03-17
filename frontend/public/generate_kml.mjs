import fs from 'fs';
import tokml from 'tokml';

try {
    const geojsonData = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/12nm_bounds.geojson', 'utf8'));
    
    // Add default styling before converting to KML matching JWC War Risk Zone Red
    for (const feature of geojsonData.features) {
        if (!feature.properties) feature.properties = {};
        feature.properties.stroke = '#ef4444'; // Red stroke
        feature.properties['stroke-width'] = 2; // Keep at 2 for visibility in KML
        feature.properties['stroke-opacity'] = 0.5;
        feature.properties.fill = '#ef4444';   // Red fill
        feature.properties['fill-opacity'] = 0.15;
    }
    
    const kmlString = tokml(geojsonData, {
        name: 'name',
        description: 'type',
        documentName: '12NM Territorial Waters HRA',
        documentDescription: 'Saudi Arabia (West Coast), Israel, Lebanon 12NM Territorial Waters Buffer (Excluding Land and existing War Risk Zones)',
        simplestyle: true
    });
    
    fs.writeFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/12nm_bounds.kml', kmlString);
    console.log('Successfully generated 12nm_bounds.kml in Red');
} catch (e) {
    console.error('Error converting to KML:', e);
}
