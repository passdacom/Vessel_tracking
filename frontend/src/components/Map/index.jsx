import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import VesselMarker from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";
import PortMarker from "./PortMarker.jsx";

// ── 픽셀 기반 라벨 방향 결정 ─────────────────────────────────────────────────
// 선박 아이콘 반경(px), 라벨 화살표 높이(px), 라벨 크기 추정(px)
const ICON_R   = 14;
const ARROW_H  = 7;
const LABEL_W  = 95;
const LABEL_H  = 18;

// direction별 라벨 바운딩박스 top-left (vessel 픽셀 좌표 기준)
function getLabelBox(px, dir) {
    const g = ICON_R + ARROW_H; // gap: 아이콘 엣지 + 화살표
    switch (dir) {
        case 'top':    return { x: px.x - LABEL_W / 2, y: px.y - g - LABEL_H };
        case 'bottom': return { x: px.x - LABEL_W / 2, y: px.y + g };
        case 'right':  return { x: px.x + g,            y: px.y - LABEL_H / 2 };
        case 'left':   return { x: px.x - g - LABEL_W,  y: px.y - LABEL_H / 2 };
        default:       return { x: px.x - LABEL_W / 2, y: px.y - g - LABEL_H };
    }
}

function rectsOverlapArea(ax, ay, bx, by) {
    const ox = Math.max(0, Math.min(ax + LABEL_W, bx + LABEL_W) - Math.max(ax, bx));
    const oy = Math.max(0, Math.min(ay + LABEL_H, by + LABEL_H) - Math.max(ay, by));
    return ox * oy;
}

function computeLabelDirections(vessels, positions, map) {
    if (!map) return {};

    const DIRS = ['top', 'right', 'bottom', 'left'];

    // 위치 있는 선박만 픽셀 좌표로 변환
    const active = vessels
        .map(v => ({ v, pos: positions[v.id]?.[0] }))
        .filter(x => x.pos)
        .map(({ v, pos }) => ({
            v,
            px: map.latLngToContainerPoint([pos.lat, pos.lon]),
        }));

    if (active.length === 0) return {};

    const result  = {};
    const placed  = []; // 이미 배치된 라벨 박스들 { x, y }

    for (const { v, px } of active) {
        let bestDir   = 'top';
        let minScore  = Infinity;

        for (const dir of DIRS) {
            const box = getLabelBox(px, dir);
            let score = 0;

            // 기배치 라벨과의 겹침 넓이
            for (const p of placed) {
                score += rectsOverlapArea(box.x, box.y, p.x, p.y);
            }

            // 다른 선박 아이콘과의 겹침 (아이콘을 작은 사각형으로 근사)
            for (const { px: opx } of active) {
                if (opx === px) continue;
                const ox = Math.max(0, Math.min(box.x + LABEL_W, opx.x + ICON_R) - Math.max(box.x, opx.x - ICON_R));
                const oy = Math.max(0, Math.min(box.y + LABEL_H, opx.y + ICON_R) - Math.max(box.y, opx.y - ICON_R));
                score += ox * oy * 2; // 아이콘 겹침은 더 높은 패널티
            }

            if (score < minScore) {
                minScore = score;
                bestDir  = dir;
            }
            if (score === 0) break; // 완벽한 배치, 조기 종료
        }

        result[v.id] = bestDir;
        placed.push(getLabelBox(px, bestDir));
    }

    return result;
}

// ── 라벨 방향 계산 컴포넌트 (MapContainer 내부에서 실행) ─────────────────────
function LabelDirectionComputer({ vessels, positions, onDirectionsChange }) {
    const map = useMap();

    useEffect(() => {
        function compute() {
            onDirectionsChange(computeLabelDirections(vessels, positions, map));
        }
        compute();
        map.on('zoomend', compute);
        return () => map.off('zoomend', compute);
    }, [map, vessels, positions, onDirectionsChange]);

    return null;
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

export default function Map({ vessels, positions, selectedVesselId, panTrigger, onSelectVessel, zoneSettings, trackHours, selectedPort, portPanTrigger, playbackVesselId, playback, playbackFollow }) {
    const [zoom, setZoom] = useState(5);
    const [labelDirections, setLabelDirections] = useState({});
    const isPlayback = !!playbackVesselId;
    const pbState = playback?.playbackState;

    // setLabelDirections는 안정적인 setState이므로 useCallback 불필요
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
            <RestrictedZone zoneSettings={zoneSettings} />
            <ZoomListener setZoom={setZoom} />

            {/* 픽셀 기반 라벨 방향 계산 (zoom 변경 시 재계산) */}
            <LabelDirectionComputer
                vessels={vessels}
                positions={positions}
                onDirectionsChange={setLabelDirections}
            />

            {/* 재생 중 자동 추적 */}
            {isPlayback && pbState?.currentPosition && (
                <PlaybackMapController position={pbState.currentPosition} follow={playbackFollow} />
            )}

            {selectedPort && (
                <PortMarker key={selectedPort.id} port={selectedPort} onClick={() => {}} />
            )}

            {vessels.map((vessel) => {
                const isPlaybackTarget = isPlayback && vessel.id === playbackVesselId;
                const labelDirection = labelDirections[vessel.id] || 'top';

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
                                labelDirection={labelDirection}
                            />
                        </React.Fragment>
                    );
                }

                // 일반 선박
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
                                trackHours={trackHours}
                                labelDirection={labelDirection}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </MapContainer>
    );
}
