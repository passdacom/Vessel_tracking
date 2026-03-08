import React, { useMemo } from 'react';
import { Marker, Popup, Tooltip } from 'react-leaflet';
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
        className: 'custom-vessel-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
        tooltipAnchor: [0, 0]
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

export default function VesselMarker({ vessel, position, isSelected, onClick, direction = 'top', labelOffset = [0, -12] }) {
    const rotation = position.heading ?? position.cog ?? 0;

    const icon = useMemo(
        () => createShipIcon(vessel.color, rotation, isSelected),
        [vessel.color, rotation, isSelected]
    );

    const displayName = vessel.alias || vessel.name || vessel.mmsi;
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
            <Tooltip permanent direction={direction} offset={labelOffset} className="!bg-transparent !border-0 !shadow-none p-0 text-[10px] font-bold whitespace-nowrap" interactive={false} opacity={1}>
                <span style={{
                    color: '#fff',
                    textShadow: `0 0 4px ${vessel.color}, 0 0 10px ${vessel.color}, 0 0 15px ${vessel.color}, 0px 1px 3px rgba(0,0,0,0.8)`
                }}>
                    {displayName}
                </span>
            </Tooltip>
            <Popup className="glass-popup">
                <div style={{ minWidth: 220, fontFamily: 'sans-serif', background: '#0F172A', color: '#e2e8f0', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                    {/* 선박명 헤더 */}
                    <div style={{ fontWeight: 900, fontSize: 16, color: '#fff', marginBottom: 4, letterSpacing: '0.05em' }}>
                        {flag && <span style={{ marginRight: 6 }}>{flag}</span>}
                        {displayName}
                    </div>

                    {/* 선박 유형 */}
                    {vesselType && (
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {vesselType}
                            {vessel.yearBuilt && ` · BUILD ${vessel.yearBuilt}`}
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid #334155', margin: '8px 0' }} />

                    {/* 항해 정보 */}
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
                        <tbody>
                            <tr>
                                <td style={{ color: '#64748b', paddingBottom: 4 }}>SPEED</td>
                                <td style={{ fontWeight: 600, color: '#f8fafc', paddingBottom: 4 }}>{position.sog != null ? `${position.sog.toFixed(1)} KTS` : '-'}</td>
                            </tr>
                            <tr>
                                <td style={{ color: '#64748b', paddingBottom: 4 }}>HEADING</td>
                                <td style={{ fontWeight: 600, color: '#f8fafc', paddingBottom: 4 }}>{position.cog != null ? `${position.cog.toFixed(0)}°` : '-'}</td>
                            </tr>
                            {destination && (
                                <tr>
                                    <td style={{ color: '#64748b', paddingBottom: 4 }}>DEST</td>
                                    <td style={{ fontWeight: 600, color: '#f8fafc', paddingBottom: 4 }}>{destination}</td>
                                </tr>
                            )}
                            {eta && (
                                <tr>
                                    <td style={{ color: '#64748b', paddingBottom: 4 }}>ETA</td>
                                    <td style={{ fontWeight: 600, color: '#38bdf8', paddingBottom: 4 }}>{eta}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    <div style={{ borderTop: '1px solid #334155', margin: '8px 0' }} />

                    {/* 선박 제원 */}
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
                        <tbody>
                            {vessel.imo && (
                                <tr>
                                    <td style={{ color: '#64748b', paddingBottom: 4 }}>IMO</td>
                                    <td style={{ fontWeight: 600, color: '#f8fafc', paddingBottom: 4 }}>{vessel.imo}</td>
                                </tr>
                            )}
                            {gt && (
                                <tr>
                                    <td style={{ color: '#64748b', paddingBottom: 4 }}>GT</td>
                                    <td style={{ fontWeight: 600, color: '#f8fafc', paddingBottom: 4 }}>{gt}</td>
                                </tr>
                            )}
                            <tr>
                                <td style={{ color: '#64748b', paddingBottom: 4 }}>LAT / LON</td>
                                <td style={{ fontWeight: 600, color: '#f8fafc', paddingBottom: 4 }}>{position.lat.toFixed(5)}°N, {position.lon.toFixed(5)}°E</td>
                            </tr>
                            <tr>
                                <td style={{ color: '#64748b' }}>LAST SEEN</td>
                                <td style={{ fontWeight: 600, color: '#ef4444' }}>{timeSince(position.timestamp)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Popup>
        </Marker>
    );
}
