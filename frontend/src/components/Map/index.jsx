import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import VesselMarker, { OFFSETS } from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";

function MapController({ selectedVesselId, vessels, positions }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedVesselId) return;
    const vessel = vessels.find((v) => v.id === selectedVesselId);
    if (!vessel) return;
    const pos = positions[vessel.id]?.[0];
    if (pos) map.flyTo([pos.lat, pos.lon], Math.max(map.getZoom(), 10), { duration: 1.2 });
  }, [selectedVesselId]); // eslint-disable-line
  return null;
}

// 두 마커가 픽셀 공간에서 가까운지 판단 (위도/경도 거리 기반 근사)
// deg_per_px: zoom 5 기준으로 약 0.01도 ≈ 1px 정도이므로 임계값을 0.8도로 설정
const CLUSTER_THRESHOLD = 0.8;

function computeLabelOffsets(vessels, positions) {
  // 마커가 있는 선박만 추출
  const active = vessels
    .map((v) => ({ vessel: v, pos: positions[v.id]?.[0] }))
    .filter((x) => x.pos);

  const offsets = {};
  // 초기 오프셋은 모두 위쪽(기본)
  active.forEach(({ vessel }) => {
    offsets[vessel.id] = OFFSETS[0];
  });

  // 두 선박이 서로 가까우면 겹치지 않게 오프셋 할당
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const dlat = Math.abs(a.pos.lat - b.pos.lat);
      const dlon = Math.abs(a.pos.lon - b.pos.lon);
      if (dlat < CLUSTER_THRESHOLD && dlon < CLUSTER_THRESHOLD) {
        // a는 위, b는 아래로
        offsets[a.vessel.id] = OFFSETS[0]; // 위
        offsets[b.vessel.id] = OFFSETS[1]; // 아래
      }
    }
  }

  return offsets;
}

export default function Map({ vessels, positions, selectedVesselId, onSelectVessel, showRestrictedZone = true }) {
  const labelOffsets = useMemo(
    () => computeLabelOffsets(vessels, positions),
    [vessels, positions]
  );

  return (
    <MapContainer center={[25.0, 55.0]} zoom={5} style={{ height: "100%", width: "100%" }} zoomControl={true}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      <MapController selectedVesselId={selectedVesselId} vessels={vessels} positions={positions} />
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
                labelOffset={labelOffsets[vessel.id] || [0, -36]}
              />
            )}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}
