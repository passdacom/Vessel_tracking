import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * 드래그 가능한 선박명 라벨 마커
 * - 마우스로 끌어서 원하는 위치로 이동 가능
 * - localStorage에 위치 저장 (새로고침 후 유지)
 */

const STORAGE_KEY = 'vessel_label_offsets'; // { [vesselId]: [latOffset, lonOffset] }

function loadStoredOffsets() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveOffset(vesselId, latOffset, lonOffset) {
    const stored = loadStoredOffsets();
    stored[vesselId] = [latOffset, lonOffset];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function createLabelIcon(name, color, isStale) {
    const textColor = isStale ? '#9ca3af' : color;
    const prefix = isStale ? '⏸ ' : '';
    const shadow = '-1.5px -1.5px 0px rgba(255,255,255,0.9), 1.5px -1.5px 0px rgba(255,255,255,0.9), -1.5px 1.5px 0px rgba(255,255,255,0.9), 1.5px 1.5px 0px rgba(255,255,255,0.9)';
    return L.divIcon({
        html: `<div style="
            color: ${textColor};
            font-size: 12px;
            font-weight: 700;
            font-family: sans-serif;
            white-space: nowrap;
            text-shadow: ${shadow};
            cursor: grab;
            user-select: none;
            padding: 2px 3px;
            line-height: 1.2;
        ">${prefix}${name}</div>`,
        className: '',
        iconSize: null,   // 크기 자동
        iconAnchor: [0, 0],
    });
}

export default function DraggableVesselLabel({ vessel, position, trackHours = 24 }) {
    const map = useMap();
    const storedOffsets = useRef(loadStoredOffsets());

    const [latLon, setLatLon] = useState(() => {
        // 저장된 오프셋이 있으면 적용
        const saved = storedOffsets.current[vessel.id];
        if (saved) {
            return [position.lat + saved[0], position.lon + saved[1]];
        }
        // 기본 위치: 선박 위쪽 약간
        return [position.lat + 0.07, position.lon];
    });

    const isStale = Date.now() - new Date(position.timestamp) > trackHours * 60 * 60 * 1000;
    const displayName = vessel.alias || vessel.name || vessel.mmsi;

    const icon = React.useMemo(
        () => createLabelIcon(displayName, vessel.color, isStale),
        [displayName, vessel.color, isStale]
    );

    // 선박이 새 위치로 이동했을 때 저장된 오프셋 유지해서 라벨 위치 재계산
    useEffect(() => {
        const saved = storedOffsets.current[vessel.id];
        if (saved) {
            setLatLon([position.lat + saved[0], position.lon + saved[1]]);
        }
    }, [position.lat, position.lon, vessel.id]);

    const markerRef = useRef(null);

    const eventHandlers = useCallback(() => ({
        dragend(e) {
            const newLatLng = e.target.getLatLng();
            const latOffset = newLatLng.lat - position.lat;
            const lonOffset = newLatLng.lng - position.lon;
            setLatLon([newLatLng.lat, newLatLng.lng]);
            saveOffset(vessel.id, latOffset, lonOffset);
        },
        // eslint-disable-next-line
    }), [position.lat, position.lon, vessel.id]);

    return (
        <Marker
            ref={markerRef}
            position={latLon}
            icon={icon}
            draggable={true}
            eventHandlers={eventHandlers()}
            zIndexOffset={-100}  // 선박 마커보다 뒤에 표시
        />
    );
}
