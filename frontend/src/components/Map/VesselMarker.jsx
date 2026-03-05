import React, { useMemo } from 'react';
import { Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';

function createShipIcon(color, rotation, isSelected, displayName) {
    const size = isSelected ? 34 : 26;
    const glow = isSelected
        ? `filter: drop-shadow(0 0 5px white) drop-shadow(0 0 10px ${color});`
        : '';

    // 배 모양 SVG
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

    // 🌟 핵심 해결책: CSS Mix-blend-mode 또는 background-color가 있는 커스텀 HTML 라벨을 마커 자체에 일체형으로 부착 (Tooltip 안씀)
    const html = `
      <div style="position: relative; width: ${size}px; height: ${size}px; transform: rotate(${rotation}deg); transform-origin: center; line-height: 0;">
         ${svg}
      </div>
      <div style="
         position: absolute;
         left: ${size / 2}px;
         top: 100%; 
         transform: translate(-50%, 4px);
         white-space: nowrap;
         font-size: 11px;
         font-weight: 800;
         font-family: sans-serif;
         color: ${color};
         text-shadow: -1.5px -1.5px 0 rgba(255,255,255,0.9), 
                       1.5px -1.5px 0 rgba(255,255,255,0.9), 
                      -1.5px  1.5px 0 rgba(255,255,255,0.9), 
                       1.5px  1.5px 0 rgba(255,255,255,0.9), 
                       0     0     4px rgba(255,255,255,1);
         pointer-events: none;
         z-index: 1000;
      ">
        ${displayName}
      </div>
    `;

    return L.divIcon({
        html: html,
        className: 'custom-vessel-icon',
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

function flagEmoji(iso) {
    if (!iso) return '';
    try {
        const codePoints = [...iso.toUpperCase()].map(
            (c) => 0x1f1e6 + c.charCodeAt(0) - 65
        );
        return String.fromCodePoint(...codePoints);
    } catch {
        return '';
    }
}

function formatEta(eta) {
    if (!eta) return null;
    const d = new Date(eta);
    if (isNaN(d)) return null;
    return (
        d.toLocaleString('en-US', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
            hour12: false,
        }) + ' UTC'
    );
}

export default function VesselMarker({ vessel, position, isSelected, onClick }) {
    const rotation = position.heading ?? position.cog ?? 0;
    const displayName = vessel.alias || vessel.name || vessel.mmsi;

    const icon = useMemo(
        () => createShipIcon(vessel.color, rotation, isSelected, displayName),
        [vessel.color, rotation, isSelected, displayName]
    );

    const flag = flagEmoji(vessel.countryIso);
    const vesselType = vessel.typeSpecific || vessel.vesselType;
    const destination = position.destination;
    const eta = position.eta ? formatEta(position.eta) : null;
    const gt = vessel.grossTonnage ? vessel.grossTonnage.toLocaleString() : null;

    // 구분선 스타일
    const divider = { borderTop: '1px solid #e5e7eb', margin: '6px 0' };
    const labelStyle = { color: '#9ca3af', paddingRight: 10, paddingBottom: 3, fontSize: 12 };
    const valueStyle = { fontWeight: 500, fontSize: 12 };

    return (
        <Marker
            position={[position.lat, position.lon]}
            icon={icon}
            eventHandlers={{ click: onClick }}
            zIndexOffset={isSelected ? 1000 : 0}
        >
            <Popup>
                <div style={{ minWidth: 200, fontFamily: 'sans-serif' }}>
                    {/* 선박명 헤더 */}
                    <div style={{ fontWeight: 'bold', fontSize: 15, color: vessel.color, marginBottom: 2 }}>
                        {flag && <span style={{ marginRight: 6 }}>{flag}</span>}
                        {displayName}
                    </div>

                    {/* 선박 유형 */}
                    {vesselType && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                            {vesselType}
                            {vessel.yearBuilt && ` · ${vessel.yearBuilt}년 건조`}
                        </div>
                    )}

                    <div style={divider} />

                    {/* 항해 정보 */}
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                            <tr>
                                <td style={labelStyle}>속력</td>
                                <td style={valueStyle}>{position.sog != null ? `${position.sog.toFixed(1)} kn` : '-'}</td>
                            </tr>
                            <tr>
                                <td style={labelStyle}>항로 (COG)</td>
                                <td style={valueStyle}>{position.cog != null ? `${position.cog.toFixed(0)}°` : '-'}</td>
                            </tr>
                            <tr>
                                <td style={labelStyle}>선수 (HDG)</td>
                                <td style={valueStyle}>
                                    {position.heading != null ? `${position.heading}°` : '-'}
                                </td>
                            </tr>
                            {destination && (
                                <tr>
                                    <td style={labelStyle}>목적지</td>
                                    <td style={valueStyle}>{destination}</td>
                                </tr>
                            )}
                            {eta && (
                                <tr>
                                    <td style={labelStyle}>ETA</td>
                                    <td style={{ ...valueStyle, color: '#3b82f6' }}>{eta}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div style={divider} />

                    {/* 선박 제원 */}
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                        <tbody>
                            {vessel.imo && (
                                <tr>
                                    <td style={labelStyle}>IMO</td>
                                    <td style={valueStyle}>{vessel.imo}</td>
                                </tr>
                            )}
                            {gt && (
                                <tr>
                                    <td style={labelStyle}>총톤수 (GT)</td>
                                    <td style={valueStyle}>{gt}</td>
                                </tr>
                            )}
                            {vessel.deadweight && (
                                <tr>
                                    <td style={labelStyle}>재화중량 (DWT)</td>
                                    <td style={valueStyle}>{vessel.deadweight.toLocaleString()}</td>
                                </tr>
                            )}
                            <tr>
                                <td style={labelStyle}>위도</td>
                                <td style={valueStyle}>{position.lat.toFixed(5)}°N</td>
                            </tr>
                            <tr>
                                <td style={labelStyle}>경도</td>
                                <td style={valueStyle}>{position.lon.toFixed(5)}°E</td>
                            </tr>
                            <tr>
                                <td style={labelStyle}>업데이트</td>
                                <td style={valueStyle}>{timeSince(position.timestamp)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Popup>
        </Marker>
    );
}
