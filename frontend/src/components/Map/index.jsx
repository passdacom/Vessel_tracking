import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import VesselMarker from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";
import DraggableVesselLabel from "./DraggableVesselLabel.jsx";
import PortMarker from "./PortMarker.jsx";

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

function MapController({ selectedVesselId, panTrigger, vessels, positions, selectedPort, portPanTrigger }) {
    const map = useMap();
    useEffect(() => {
        if (!selectedVesselId || panTrigger === 0) return;
        const vessel = vessels.find((v) => v.id === selectedVesselId);
        if (!vessel) return;
        const pos = positions[vessel.id]?.[0];
        if (pos) map.flyTo([pos.lat, pos.lon], map.getZoom(), { duration: 1.2 });
    }, [panTrigger]); // eslint-disable-line
    useEffect(() => {
        if (!selectedPort || portPanTrigger === 0) return;
        map.flyTo([selectedPort.lat, selectedPort.lon], map.getZoom(), { duration: 1.2 });
    }, [portPanTrigger]); // eslint-disable-line
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

// 재생 중 자동 추적
function PlaybackMapController({ position, follow }) {
    const map = useMap();
    useEffect(() => {
        if (follow && position) {
            map.panTo([position.lat, position.lon], { animate: false });
        }
    }, [position?.lat, position?.lon, follow]); // eslint-disable-line
    return null;
}

export default function Map({ vessels, positions, selectedVesselId, panTrigger, onSelectVessel, showRestrictedZone = true, zoneOpacity = 0.15, selectedRegions, toggleSelectedRegion, trackHours, selectedPort, portPanTrigger, playbackVesselId, playback, playbackFollow }) {
    const [zoom, setZoom] = useState(5);
    const isPlayback = !!playbackVesselId;
    const pbState = playback?.playbackState;

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
            <MapController selectedVesselId={selectedVesselId} panTrigger={panTrigger} vessels={vessels} positions={positions} selectedPort={selectedPort} portPanTrigger={portPanTrigger} />
            <RestrictedZone visible={showRestrictedZone} opacityValue={zoneOpacity} selectedRegions={selectedRegions} toggleSelectedRegion={toggleSelectedRegion} />

            <ZoomListener setZoom={setZoom} />

            {/* 재생 중 자동 추적 */}
            {isPlayback && pbState?.currentPosition && (
                <PlaybackMapController position={pbState.currentPosition} follow={playbackFollow} />
            )}

            {selectedPort && (
                <PortMarker key={selectedPort.id} port={selectedPort} onClick={() => {}} />
            )}

            {vessels.map((vessel) => {
                const isPlaybackTarget = isPlayback && vessel.id === playbackVesselId;

                // 재생 대상 선박: 재생 위치로 마커/트랙 교체
                if (isPlaybackTarget && pbState?.currentPosition) {
                    const elapsed = pbState.elapsedPositions || [];
                    return (
                        <React.Fragment key={vessel.id}>
                            <VesselTrack positions={elapsed} color={vessel.color} />
                            <VesselMarker
                                vessel={vessel}
                                position={pbState.currentPosition}
                                isSelected={true}
                                onClick={() => {}}
                                trackHours={trackHours}
                            />
                            <DraggableVesselLabel
                                vessel={vessel}
                                position={pbState.currentPosition}
                                trackHours={trackHours}
                            />
                        </React.Fragment>
                    );
                }

                // 일반 선박 (재생 중이 아닌 다른 선박 포함)
                const vesselPositions = positions[vessel.id] || [];
                const latest = vesselPositions[0];

                return (
                    <React.Fragment key={vessel.id}>
                        <VesselTrack positions={vesselPositions} color={vessel.color} />
                        {latest && (
                            <>
                                <VesselMarker
                                    vessel={vessel}
                                    position={latest}
                                    isSelected={selectedVesselId === vessel.id}
                                    onClick={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
                                    trackHours={trackHours}
                                />
                                <DraggableVesselLabel
                                    vessel={vessel}
                                    position={latest}
                                    trackHours={trackHours}
                                />
                            </>
                        )}
                    </React.Fragment>
                );
            })}
        </MapContainer>
    );
}
