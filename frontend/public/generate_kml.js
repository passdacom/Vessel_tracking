const fs = require('fs');
const tokml = require('tokml');

try {
    const geojsonData = JSON.parse(fs.readFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/12nm_bounds.geojson', 'utf8'));
    
    // Convert to KML with styling properties based on the GeoJSON
    // In tokml, simpler names make cleaner styling
    const kmlString = tokml(geojsonData, {
        name: 'name',
        description: 'type',
        documentName: '12NM Territorial Waters HRA',
        documentDescription: 'Saudi Arabia (West Coast), Israel, Lebanon 12NM Territorial Waters Buffer (Excluding Land and existing War Risk Zones)',
        simplestyle: true
    });
    
    fs.writeFileSync('/root/.openclaw/workspace/Vessel_tracking/frontend/public/12nm_bounds.kml', kmlString);
    console.log('Successfully generated 12nm_bounds.kml');
} catch (e) {
    console.error('Error converting to KML:', e);
}
