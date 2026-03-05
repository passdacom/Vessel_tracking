import React, { useEffect } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import VesselMarker from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";

function MapController({ selectedVesselId, panTrigger, vessels, positions }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedVesselId || panTrigger === 0) return;
    const vessel = vessels.find((v) => v.id === selectedVesselId);
    if (!vessel) return;
    const pos = positions[vessel.id]?.[0];
    if (pos) map.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), 10), { duration: 1.2 });
  }, [panTrigger]); // eslint-disable-line
  return null;
}

export default function Map({ vessels, positions, selectedVesselId, panTrigger, onSelectVessel, showRestrictedZone = true }) {
  return (
    <MapContainer 
      center={[25.0, 55.0]} 
      zoom={5} 
      style={{ height: "100%", width: "100%" }} 
      zoomControl={true}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <MapController selectedVesselId={selectedVesselId} panTrigger={panTrigger} vessels={vessels} positions={positions} />
      <RestrictedZone visible={showRestrictedZone} />
      
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
                direction="right"
                labelOffset={[0, -40]}
              />
            )}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}
