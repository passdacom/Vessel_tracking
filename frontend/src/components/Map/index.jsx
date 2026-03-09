import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import VesselMarker from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";

// 겹침 방지: 지정된 순서 옵션 (상단, 왼쪽, 오른쪽) - 3방향으로 축소
function computeDynamicOffsets(vessels, positions, zoom) {
    const active = vessels
        .map((v) => ({ vessel: v, pos: positions[v.id]?.[0] }))
        .filter((x) => x.pos);

    const offsets = {};

    // zoom이 클수록(확대) 겹침 허용, 작을수록(축소) 겹침 방지 임계값 증가
    const threshold = 1.2 / Math.pow(2, Math.max(0, zoom - 5));

    const placed = [];
    // 상(top)을 최우선으로 하고, 안되면 좌(left), 우(right)로만 회피
    const dirs = ['top', 'left', 'right'];

    for (const { vessel, pos } of active) {
        let bestDir = 'top';
        let minCollisions = 999;

        for (const d of dirs) {
            let colls = 0;
            let targetLat = pos.lat;
            let targetLon = pos.lon;

            if (d === 'right') targetLon += threshold;
            if (d === 'left') targetLon -= threshold;
            if (d === 'top') targetLat += threshold;

            for (const p of placed) {
                let pLat = p.pos.lat;
                let pLon = p.pos.lon;
                if (p.dir === 'right') pLon += threshold;
                if (p.dir === 'left') pLon -= threshold;
                if (p.dir === 'top') pLat += threshold;

                const dist = Math.sqrt((targetLat - pLat) ** 2 + (targetLon - pLon) ** 2);
                if (dist < threshold * 1.5) {
                    colls++;
                }
            }

            if (colls < minCollisions) {
                minCollisions = colls;
                bestDir = d;
            }
            if (colls === 0) break;
        }

        placed.push({ pos, dir: bestDir });

        // 오프셋 처리.
        let offsetPx = [0, 0];
        if (bestDir === 'right') offsetPx = [12, 0];
        if (bestDir === 'left') offsetPx = [-12, 0];
        if (bestDir === 'top') offsetPx = [0, -12];

        offsets[vessel.id] = { direction: bestDir, offset: offsetPx };
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

export default function Map({ vessels, positions, selectedVesselId, panTrigger, onSelectVessel, showRestrictedZone = true, trackHours }) {
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

            <ZoomListener setZoom={setZoom} />

            {vessels.map((vessel) => {
                const vesselPositions = positions[vessel.id] || [];
                const latest = vesselPositions[0];
                const layout = labelOffsets[vessel.id] || { direction: 'top', offset: [0, -12] };

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
                                trackHours={trackHours}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </MapContainer>
    );
}
