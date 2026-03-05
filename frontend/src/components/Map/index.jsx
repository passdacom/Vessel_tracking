import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import VesselMarker from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";

// 줌 레벨에 기반하여 픽셀 거리로 겹침을 방지하도록 하는 자체 로직
function computeDynamicOffsets(vessels, positions, zoom) {
  const active = vessels
    .map((v) => ({ vessel: v, pos: positions[v.id]?.[0] }))
    .filter((x) => x.pos);

  const offsets = {};
  
  // 기본값 설정 (우측)
  active.forEach(({ vessel }) => {
    offsets[vessel.id] = { direction: 'right', offset: [5, -40] };
  });

  // 아주 단순화된 충돌 감지 (위경도상 거리로 판별)
  // zoom이 클수록(확대) 겹침 허용, 작을수록(축소) 겹침 방지 임계값 증가
  const collisionThresholdDeg = 1.0 / Math.pow(2, Math.max(0, zoom - 5));
  
  // 간단하게 겹치는 쌍을 발견하면 한 쪽의 방향을 바꿈 (간이 로직)
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const dlat = Math.abs(a.pos.lat - b.pos.lat);
      const dlon = Math.abs(a.pos.lon - b.pos.lon);
      
      // 약간의 차이로 겹칠 경우 오프셋 방향 다르게
      if (dlat < collisionThresholdDeg && dlon < collisionThresholdDeg) {
         // a는 위쪽, b는 우하단으로 밀어냄
         offsets[a.vessel.id] = { direction: 'top', offset: [0, -50] };
         offsets[b.vessel.id] = { direction: 'bottom', offset: [0, -10] };
         break; // 한 번 회피하면 다음 루프로
      }
    }
  }
  return offsets;
}

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

function ZoomListener({ setZoom }) {
    const map = useMap();
    useEffect(() => {
        const onZoom = () => setZoom(map.getZoom());
        map.on('zoomend', onZoom);
        return () => map.off('zoomend', onZoom);
    }, [map, setZoom]);
    return null;
}

export default function Map({ vessels, positions, selectedVesselId, panTrigger, onSelectVessel, showRestrictedZone = true }) {
  const [zoom, setZoom] = useState(5);

  const labelOffsets = useMemo(
    () => computeDynamicOffsets(vessels, positions, zoom),
    [vessels, positions, zoom]
  );

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
      
      {/* 줌 이벤트 리스너 */}
      <ZoomListener setZoom={setZoom} />
      
      {vessels.map((vessel) => {
        const vesselPositions = positions[vessel.id] || [];
        const latest = vesselPositions[0];
        const layout = labelOffsets[vessel.id] || { direction: 'right', offset: [0, -36] };
        
        return (
          <React.Fragment key={vessel.id}>
            <VesselTrack positions={vesselPositions} color={vessel.color} />
            {latest && (
              <VesselMarker
                vessel={vessel}
                position={latest}
                isSelected={selectedVesselId === vessel.id}
                onClick={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
                direction={layout.direction}
                labelOffset={layout.offset}
              />
            )}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}
