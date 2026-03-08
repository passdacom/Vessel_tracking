import React, { useState } from 'react';

// ISO 국가 코드 → 국기 이모지 변환
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

// ETA 포맷: 'Mar 02, 14:30 UTC' 형태
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

// 마지막 업데이트 시간 표시
function lastSeenText(timestamp) {
    if (!timestamp) return '신호 없음';
    const secs = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (secs < 60) return `${secs}초 전`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
}

const COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
    '#14b8a6', '#f43f5e',
];

export default function VesselCard({
    vessel,
    latestPosition,
    isSelected,
    onSelect,
    onDelete,
    onUpdate,
    onPan,
}) {
    const [editing, setEditing] = useState(false);
    const [alias, setAlias] = useState(vessel.alias || vessel.name || '');
    const [color, setColor] = useState(vessel.color);

    const displayName = vessel.alias || vessel.name || vessel.mmsi;
    const stale =
        !latestPosition ||
        Date.now() - new Date(latestPosition.timestamp) > 60 * 60 * 1000;
    const lastSeen = latestPosition ? lastSeenText(latestPosition.timestamp) : null;

    // 확장 필드
    const flag = flagEmoji(vessel.countryIso);
    const vesselType = vessel.typeSpecific || vessel.vesselType || null;
    const companyType = vessel.companyType || '자사간사';
    const destination = latestPosition?.destination || null;
    const eta = latestPosition?.eta ? formatEta(latestPosition.eta) : null;
    const gt = vessel.grossTonnage ? vessel.grossTonnage.toLocaleString() : null;
    const yearBuilt = vessel.yearBuilt;

    function handleSave() {
        onUpdate({ alias: alias.trim() || null, color });
        setEditing(false);
    }
    function handleCancel() {
        setAlias(vessel.alias || vessel.name || '');
        setColor(vessel.color);
        setEditing(false);
    }

    // ── 편집 모드 ──
    if (editing) {
        return (
            <div className="bg-gray-800 rounded-lg p-3 border border-blue-500">
                <p className="text-gray-400 text-xs mb-1.5">별칭</p>
                <input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 mb-2 border border-gray-600"
                    placeholder="선박 별칭 입력"
                    autoFocus
                />
                <p className="text-gray-400 text-xs mb-1.5">색상 선택</p>
                <div className="flex gap-1.5 flex-wrap mb-3">
                    {COLORS.map((c) => (
                        <button
                            key={c}
                            onClick={() => setColor(c)}
                            className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                            style={{
                                backgroundColor: c,
                                outline: color === c ? '2px solid white' : '2px solid transparent',
                                outlineOffset: '2px',
                            }}
                        />
                    ))}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                    >
                        저장
                    </button>
                    <button
                        onClick={handleCancel}
                        className="flex-1 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500 transition"
                    >
                        취소
                    </button>
                </div>
            </div>
        );
    }

    // ── 표시 모드 ──
    return (
        <div
            onClick={onSelect}
            className={`glass-card rounded-lg p-3 cursor-pointer transition-all border ${isSelected
                ? 'border-red-500/50 bg-slate-800/80 shadow-[0_0_15px_rgba(239,68,68,0.15)] scale-[1.02]'
                : 'border-slate-800 hover:border-slate-600'
                }`}
        >
            {/* 헤더 행 */}
            <div className="flex items-center gap-2 mb-1">
                {/* 색상 점 + stale 인디케이터 */}
                <div className="relative flex-shrink-0">
                    <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: vessel.color }}
                    />
                    {stale && (
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
                    )}
                </div>

                {/* 선박명 + 국기 */}
                <span className="text-white font-black text-[13px] tracking-wide truncate flex-1 leading-none pt-0.5">
                    {flag && <span className="mr-1.5">{flag}</span>}
                    {displayName}
                </span>

                {/* 소속 뱃지 */}
                <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 font-bold tracking-wider ${companyType === '타사간사' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-red-500/20 text-red-500 border border-red-500/30'
                    }`}>
                    {companyType === '타사간사' ? 'EXTERNAL' : 'FLEET'}
                </span>

                {/* 편집/삭제 버튼 */}
                <div className="flex gap-0.5 flex-shrink-0 ml-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditing(true);
                        }}
                        className="p-1 text-slate-500 hover:text-white rounded transition"
                        title="편집"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`"${displayName}"을 삭제하시겠습니까?`))
                                onDelete();
                        }}
                        className="p-1 text-slate-500 hover:text-red-500 rounded transition"
                        title="삭제"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            </div>

            {/* 선박 상세 정보 (isSelected일 때만) */}
            {isSelected && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <div className="flex flex-col gap-2">
                        {/* Status Grid */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">SPEED</span>
                                <span className="text-sm font-mono text-white">
                                    {latestPosition?.sog != null ? `${latestPosition.sog.toFixed(1)} KTS` : '-'}
                                </span>
                            </div>
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">HEADING</span>
                                <span className="text-sm font-mono text-white">
                                    {latestPosition?.cog != null ? `${latestPosition.cog.toFixed(0)}°` : '-'}
                                </span>
                            </div>
                            <div className="bg-slate-900/50 p-2 rounded border border-slate-800 col-span-2">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-0.5">DESTINATION / ETA</span>
                                <span className="text-xs text-white truncate block">
                                    {destination || 'UNKNOWN'} {eta ? `· ${eta}` : ''}
                                </span>
                            </div>
                        </div>

                        {/* Vessel Info */}
                        <div className="bg-slate-900/50 p-2 rounded border border-slate-800">
                            <div className="flex justify-between items-center mb-1 text-[10px] text-slate-500 uppercase tracking-wider">
                                <span>TYPE & MMSI</span>
                                <span>BUILD / GT</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-slate-300">
                                <span className="truncate flex-1 pr-2">{vesselType || 'UNKNOWN'} · {vessel.mmsi}</span>
                                <span className="flex-shrink-0 text-right">{yearBuilt || '--'} / {gt || '--'}</span>
                            </div>
                        </div>

                        {/* Coordinates & Status */}
                        <div className="flex items-center justify-between mt-1 px-1">
                            <span className="font-mono text-[10px] text-slate-400">
                                {latestPosition ? `${latestPosition.lat?.toFixed(5)}°N, ${latestPosition.lon?.toFixed(5)}°E` : 'Coords Unavailable'}
                            </span>
                            <span className={`text-[10px] font-bold ${stale ? 'text-slate-500' : 'text-red-500 animate-pulse'}`}>
                                {lastSeen}
                            </span>
                        </div>

                        {/* JWC Guidance Notice */}
                        <div className="mt-1 bg-red-500/10 border border-red-500/20 p-2 rounded flex items-start gap-2">
                            <span className="text-[12px] mt-0.5">⚠️</span>
                            <div className="flex-1">
                                <div className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-0.5">JWC GUIDANCE</div>
                                <div className="text-[10px] text-slate-400 leading-tight">High Risk Area - Heightened vigilance required. Report positions daily to UKMTO.</div>
                            </div>
                        </div>

                        {/* 지도로 이동 버튼 */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onPan) onPan();
                            }}
                            className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] uppercase tracking-wider font-bold rounded transition flex items-center justify-center gap-1.5 border border-slate-700 hover:border-slate-500"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            PAN TO VESSEL
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
