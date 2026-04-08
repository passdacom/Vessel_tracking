import React, { useMemo, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

function createShipIcon(color, rotation, isSelected, isStale) {
    const size = isSelected ? 34 : 26;

    // stale 선박은 회색으로 채우고 투명도 낮춤
    const fillColor = isStale ? '#888888' : color;
    const strokeColor = isStale ? '#aaaaaa' : 'white';

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="${size}" height="${size}">
      <polygon 
        points="12,2 21,24 12,19 3,24" 
        fill="${fillColor}" 
        stroke="${strokeColor}" 
        stroke-width="1.5" 
        stroke-linejoin="round"
        ${isSelected ? `filter="url(#sel-glow)"` : ''}
      />
      ${isSelected ? `<defs><filter id="sel-glow"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="white" flood-opacity="0.8"/></filter></defs>` : ''}
    </svg>
  `;

    // stale 선박: 전체 마커 div에 opacity 적용
    const wrapperStyle = isStale
        ? `transform: rotate(${rotation}deg); transform-origin: center; line-height: 0; opacity: 0.5;`
        : `transform: rotate(${rotation}deg); transform-origin: center; line-height: 0;`;

    return L.divIcon({
        html: `<div style="${wrapperStyle}">${svg}</div>`,
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

// 국기 이모지 파싱 삭제

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

export default function VesselMarker({ vessel, position, isSelected, onClick, trackHours = 24 }) {
    const rotation = position.heading ?? position.cog ?? 0;

    const isStale = Date.now() - new Date(position.timestamp) > trackHours * 60 * 60 * 1000;

    const icon = useMemo(
        () => createShipIcon(vessel.color, rotation, isSelected, isStale),
        [vessel.color, rotation, isSelected, isStale]
    );

    const [fuPw, setFuPw] = useState('');
    const [fuLoading, setFuLoading] = useState(false);
    const [fuResult, setFuResult] = useState(null); // null | 'ok' | 'err' | 'auth'

    const handleForceUpdate = async (e) => {
        e.stopPropagation();
        if (!fuPw || fuLoading) return;
        setFuLoading(true);
        setFuResult(null);
        try {
            const res = await fetch('/api/force-update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${fuPw}`,
                },
                body: JSON.stringify({ mmsiList: [vessel.mmsi] }),
            });
            if (res.status === 401 || res.status === 403) { setFuResult('auth'); }
            else if (res.ok) { setFuResult('ok'); }
            else { setFuResult('err'); }
        } catch { setFuResult('err'); }
        setFuLoading(false);
    };

    const displayName = vessel.alias || vessel.name || vessel.mmsi;
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
                    {/* stale 배지 */}
                    {isStale && (
                        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '4px 8px', marginBottom: 8, fontSize: 11, color: '#92400e' }}>
                            ⚠ 조회 기간 내 데이터 없음 — 마지막 위치 표시 중
                        </div>
                    )}
                    {/* 선박명 헤더 */}
                    <div style={{ fontWeight: 'bold', fontSize: 15, color: vessel.color, marginBottom: 2 }}>
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

                    {/* 강제 갱신 */}
                    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 7 }}>
                        {fuResult === 'ok' ? (
                            <div style={{ fontSize: 11, color: '#16a34a', textAlign: 'center', padding: '3px 0' }}>
                                ✓ 갱신 요청 완료
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                <input
                                    type="password"
                                    value={fuPw}
                                    onChange={(e) => { setFuPw(e.target.value); setFuResult(null); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleForceUpdate(e); }}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="관리자 비밀번호"
                                    style={{
                                        flex: 1,
                                        fontSize: 11,
                                        padding: '4px 7px',
                                        border: fuResult === 'auth' ? '1px solid #f87171' : '1px solid #d1d5db',
                                        borderRadius: 5,
                                        outline: 'none',
                                        color: '#374151',
                                        background: '#f9fafb',
                                        minWidth: 0,
                                    }}
                                />
                                <button
                                    onClick={handleForceUpdate}
                                    disabled={fuLoading || !fuPw}
                                    style={{
                                        fontSize: 11,
                                        padding: '4px 9px',
                                        borderRadius: 5,
                                        border: '1px solid #d1d5db',
                                        background: fuLoading || !fuPw ? '#f3f4f6' : '#f1f5f9',
                                        color: fuLoading || !fuPw ? '#9ca3af' : '#374151',
                                        cursor: fuLoading || !fuPw ? 'default' : 'pointer',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0,
                                    }}
                                >
                                    {fuLoading ? '…' : '강제 갱신'}
                                </button>
                            </div>
                        )}
                        {fuResult === 'auth' && (
                            <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }}>비밀번호가 올바르지 않습니다</div>
                        )}
                        {fuResult === 'err' && (
                            <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3 }}>요청 실패. 다시 시도해주세요</div>
                        )}
                    </div>
                </div>
            </Popup>
        </Marker>
    );
}
