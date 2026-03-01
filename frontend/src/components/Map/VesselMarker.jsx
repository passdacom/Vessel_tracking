import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

function createShipIcon(color, rotation, isSelected) {
  const size = isSelected ? 34 : 26;
  const glow = isSelected
    ? `filter: drop-shadow(0 0 5px white) drop-shadow(0 0 10px ${color});`
    : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="${size}" height="${size}">
      <polygon
        points="12,2 21,24 12,19 3,24"
        fill="${color}"
        stroke="white"
        stroke-width="1.5"
        stroke-linejoin="round"
        style="${glow}"
      />
    </svg>
  `;

  return L.divIcon({
    html: `<div style="transform: rotate(${rotation}deg); transform-origin: center; line-height: 0;">${svg}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function timeSince(timestamp) {
  const secs = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (secs < 60) return `${secs}초 전`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function VesselMarker({ vessel, position, isSelected, onClick }) {
  const rotation = position.heading ?? position.cog ?? 0;

  const icon = useMemo(
    () => createShipIcon(vessel.color, rotation, isSelected),
    [vessel.color, rotation, isSelected]
  );

  const displayName = vessel.alias || vessel.name || vessel.mmsi;

  return (
    <Marker
      position={[position.lat, position.lon]}
      icon={icon}
      eventHandlers={{ click: onClick }}
      zIndexOffset={isSelected ? 1000 : 0}
    >
      <Popup>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 'bold', fontSize: 15, color: vessel.color, marginBottom: 4 }}>
            {displayName}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>MMSI: {vessel.mmsi}</div>

          <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr>
                <td style={{ color: '#666', paddingRight: 12, paddingBottom: 3 }}>속력</td>
                <td style={{ fontWeight: 500 }}>{position.sog?.toFixed(1) ?? '-'} kn</td>
              </tr>
              <tr>
                <td style={{ color: '#666', paddingRight: 12, paddingBottom: 3 }}>항로 (COG)</td>
                <td style={{ fontWeight: 500 }}>{position.cog?.toFixed(0) ?? '-'}°</td>
              </tr>
              <tr>
                <td style={{ color: '#666', paddingRight: 12, paddingBottom: 3 }}>선수 (HDG)</td>
                <td style={{ fontWeight: 500 }}>
                  {position.heading != null ? `${position.heading}°` : '-'}
                </td>
              </tr>
              <tr>
                <td style={{ color: '#666', paddingRight: 12, paddingBottom: 3 }}>위도</td>
                <td style={{ fontWeight: 500 }}>{position.lat.toFixed(5)}°N</td>
              </tr>
              <tr>
                <td style={{ color: '#666', paddingRight: 12, paddingBottom: 3 }}>경도</td>
                <td style={{ fontWeight: 500 }}>{position.lon.toFixed(5)}°E</td>
              </tr>
              <tr>
                <td style={{ color: '#666', paddingRight: 12 }}>업데이트</td>
                <td style={{ fontWeight: 500 }}>{timeSince(position.timestamp)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Popup>
    </Marker>
  );
}
