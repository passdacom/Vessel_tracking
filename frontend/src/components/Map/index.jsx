import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import VesselMarker from './VesselMarker.jsx';
import VesselTrack from './VesselTrack.jsx';

// Fly to selected vessel when selection changes
function MapController({ selectedVesselId, vessels, positions }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedVesselId) return;
    const vessel = vessels.find((v) => v.id === selectedVesselId);
    if (!vessel) return;
    const pos = positions[vessel.id]?.[0];
    if (pos) {
      map.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), 10), { duration: 1.2 });
    }
  }, [selectedVesselId]); // eslint-disable-line

  return null;
}

export default function Map({ vessels, positions, selectedVesselId, onSelectVessel }) {
  return (
    <MapContainer
      center={[35.5, 129.0]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      {/* OpenStreetMap base layer */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <MapController
        selectedVesselId={selectedVesselId}
        vessels={vessels}
        positions={positions}
      />

      {vessels.map((vessel) => {
        const vesselPositions = positions[vessel.id] || [];
        const latest = vesselPositions[0];

        return (
          <React.Fragment key={vessel.id}>
            <VesselTrack positions={vesselPositions} color={vessel.color} />
            {latest && (
              <VesselMarker
                vessel={vessel}
                position={latest}
                isSelected={selectedVesselId === vessel.id}
                onClick={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
              />
            )}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}
