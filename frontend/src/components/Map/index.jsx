import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import VesselMarker from "./VesselMarker.jsx";
import VesselTrack from "./VesselTrack.jsx";
import RestrictedZone from "./RestrictedZone.jsx";
import PortMarker from "./PortMarker.jsx";
import ShippingLaneLayer from "./ShippingLaneLayer.jsx";

// ── 픽셀 기반 라벨 방향 결정 ─────────────────────────────────────────────────
const ICON_R   = 14;
const ARROW_H  = 7;
const LABEL_W  = 95;
const LABEL_H  = 18;

function getLabelBox(px, dir) {
    const g = ICON_R + ARROW_H;
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
    const active = vessels
        .map(v => ({ v, pos: positions[v.id]?.[0] }))
        .filter(x => x.pos)
        .map(({ v, pos }) => ({
            v,
            px: map.latLngToContainerPoint([pos.lat, pos.lon]),
        }));
    if (active.length === 0) return {};
    const result  = {};
    const placed  = [];
    for (const { v, px } of active) {
        let bestDir   = 'top';
        let minScore  = Infinity;
        for (const dir of DIRS) {
            const box = getLabelBox(px, dir);
            let score = 0;
            for (const p of placed) {
                score += rectsOverlapArea(box.x, box.y, p.x, p.y);
            }
            for (const { px: opx } of active) {
                if (opx === px) continue;
                const ox = Math.max(0, Math.min(box.x + LABEL_W, opx.x + ICON_R) - Math.max(box.x, opx.x - ICON_R));
                const oy = Math.max(0, Math.min(box.y + LABEL_H, opx.y + ICON_R) - Math.max(box.y, opx.y - ICON_R));
                score += ox * oy * 2;
            }
            if (score < minScore) {
                minScore = score;
                bestDir  = dir;
            }
            if (score === 0) break;
        }
        result[v.id] = bestDir;
        placed.push(getLabelBox(px, bestDir));
    }
    return result;
}

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

function PlaybackMapController({ position, follow }) {
    const map = useMap();
    useEffect(() => {
        if (follow && position) {
            map.panTo([position.lat, position.lon], { animate: false });
        }
    }, [position?.lat, position?.lon, follow]); // eslint-disable-line
    return null;
}

// ── 목적지 클릭 핸들러 ────────────────────────────────────────────────────────
function DestinationClickHandler({ enabled, onDestinationPick }) {
    const map = useMap();
    useMapEvents({
        click(e) {
            if (!enabled) return;
            onDestinationPick({ lat: e.latlng.lat, lon: e.latlng.lng });
        },
    });
    useEffect(() => {
        if (enabled) {
            map.getContainer().style.cursor = "crosshair";
        } else {
            map.getContainer().style.cursor = "";
        }
        return () => { map.getContainer().style.cursor = ""; };
    }, [map, enabled]);
    return null;
}

// ── ETA 경로 오버레이 (선박 → snap → 항로구간 → snap → 목적지) ──────────────
function EtaOverlay({ etaResult, vesselPos, destination }) {
    if (!etaResult || !vesselPos || !destination) return null;

    const { snapVCoords, snapDCoords, laneColor, usedFallback } = etaResult;

    // 목적지 마커
    const destLatLon = [destination.lat, destination.lon];

    if (usedFallback) {
        // 직선 fallback: 선박 → 목적지
        return (
            <>
                <Polyline
                    positions={[[vesselPos.lat, vesselPos.lon], destLatLon]}
                    pathOptions={{ color: "#f59e0b", weight: 2, dashArray: "6 4", opacity: 0.8 }}
                />
                <CircleMarker
                    center={destLatLon}
                    radius={8}
                    pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.8, weight: 2 }}
                >
                    <Tooltip permanent direction="top" offset={[0, -12]} className="eta-dest-tooltip">
                        <span style={{ fontSize: 11, fontWeight: 600 }}>목적지</span>
                    </Tooltip>
                </CircleMarker>
            </>
        );
    }

    if (!snapVCoords || !snapDCoords) return null;

    const snapVLatLon = [snapVCoords[1], snapVCoords[0]]; // [lon,lat] → [lat,lon]
    const snapDLatLon = [snapDCoords[1], snapDCoords[0]];

    // 항로 구간 좌표 (etaResult에 segment 없으면 snap 두 점만 연결)
    const segmentPositions = etaResult.segmentCoords
        ? etaResult.segmentCoords.map(([lon, lat]) => [lat, lon])
        : [snapVLatLon, snapDLatLon];

    return (
        <>
            {/* 선박 → 항로 진입점 (점선) */}
            <Polyline
                positions={[[vesselPos.lat, vesselPos.lon], snapVLatLon]}
                pathOptions={{ color: "#9ca3af", weight: 1.5, dashArray: "5 4", opacity: 0.75 }}
            />
            {/* 항로 구간 (강조) */}
            <Polyline
                positions={segmentPositions}
                pathOptions={{ color: laneColor || "#f59e0b", weight: 3.5, opacity: 0.9 }}
            />
            {/* 항로 이탈점 → 목적지 (점선) */}
            <Polyline
                positions={[snapDLatLon, destLatLon]}
                pathOptions={{ color: "#9ca3af", weight: 1.5, dashArray: "5 4", opacity: 0.75 }}
            />
            {/* snap 진입점 마커 */}
            <CircleMarker
                center={snapVLatLon}
                radius={5}
                pathOptions={{ color: laneColor || "#f59e0b", fillColor: laneColor || "#f59e0b", fillOpacity: 1, weight: 2 }}
            >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
                    <span style={{ fontSize: 11 }}>항로 진입점</span>
                </Tooltip>
            </CircleMarker>
            {/* snap 이탈점 마커 */}
            <CircleMarker
                center={snapDLatLon}
                radius={5}
                pathOptions={{ color: laneColor || "#f59e0b", fillColor: laneColor || "#f59e0b", fillOpacity: 1, weight: 2 }}
            >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
                    <span style={{ fontSize: 11 }}>항로 이탈점</span>
                </Tooltip>
            </CircleMarker>
            {/* 목적지 마커 */}
            <CircleMarker
                center={destLatLon}
                radius={9}
                pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.85, weight: 2.5 }}
            >
                <Tooltip permanent direction="top" offset={[0, -12]}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>목적지</span>
                </Tooltip>
            </CircleMarker>
        </>
    );
}

export default function Map({
    vessels,
    positions,
    selectedVesselId,
    panTrigger,
    onSelectVessel,
    zoneSettings,
    trackHours,
    selectedPort,
    portPanTrigger,
    playbackVesselId,
    playback,
    playbackFollow,
    showLabels = true,
    // 항로 레이어
    lanes = [],
    showLanes = true,
    // ETA 모드
    etaMode = false,
    onDestinationPick,
    etaResult = null,
    etaDestination = null,
    etaVesselPos = null,
    onStartEta,
}) {
    const [zoom, setZoom] = useState(5);
    const [labelDirections, setLabelDirections] = useState({});
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
            <RestrictedZone zoneSettings={zoneSettings} />
            <ZoomListener setZoom={setZoom} />
            <LabelDirectionComputer
                vessels={vessels}
                positions={positions}
                onDirectionsChange={setLabelDirections}
            />

            {/* 목적지 클릭 핸들러 */}
            <DestinationClickHandler enabled={etaMode} onDestinationPick={onDestinationPick} />

            {/* 재생 중 자동 추적 */}
            {isPlayback && pbState?.currentPosition && (
                <PlaybackMapController position={pbState.currentPosition} follow={playbackFollow} />
            )}

            {/* 표준 항로 레이어 */}
            {showLanes && <ShippingLaneLayer lanes={lanes} />}

            {/* ETA 경로 오버레이 */}
            <EtaOverlay
                etaResult={etaResult}
                vesselPos={etaVesselPos}
                destination={etaDestination}
            />

            {selectedPort && (
                <PortMarker key={selectedPort.id} port={selectedPort} onClick={() => {}} />
            )}

            {vessels.map((vessel) => {
                const isPlaybackTarget = isPlayback && vessel.id === playbackVesselId;
                const labelDirection = labelDirections[vessel.id] || 'top';

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
                                showLabels={showLabels}
                                onStartEta={onStartEta}
                            />
                        </React.Fragment>
                    );
                }

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
                                showLabels={showLabels}
                                onStartEta={onStartEta}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </MapContainer>
    );
}
