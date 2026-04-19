import React, { useState } from 'react';

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

// 방위각(COG/HDG)을 3자리 포맷으로
function formatDeg(val) {
    if (val == null) return '---°';
    return `${String(Math.round(val)).padStart(3, '0')}°`;
}

export default function VesselCard({
    vessel,
    latestPosition,
    isSelected,
    onSelect,
    onDelete,
    onUpdate,
    onArchive,
    isVisible = true,
    onToggleVisible,
    customGroups = [],
    apiFetch,
    onStartPlayback,
    onHistoryFetched,
    onStartEta,
}) {
    const [editing, setEditing] = useState(false);
    const [alias, setAlias] = useState(vessel.alias || vessel.name || '');
    const [color, setColor] = useState(vessel.color);
    const [showInfo, setShowInfo] = useState(false); // 선박정보 토글
    const [showGroupChange, setShowGroupChange] = useState(false); // 그룹변경 드롭다운
    const [showHistory, setShowHistory] = useState(false); // 히스토리 패널 토글
    const [historyDays, setHistoryDays] = useState(7);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyResult, setHistoryResult] = useState(null);

    const displayName = vessel.alias || vessel.name || vessel.mmsi;
    const stale =
        !latestPosition ||
        Date.now() - new Date(latestPosition.timestamp) > 60 * 60 * 1000;
    const lastSeen = latestPosition ? lastSeenText(latestPosition.timestamp) : null;

    const vesselType = vessel.typeSpecific || vessel.vesselType || null;
    const destination = latestPosition?.destination || null;
    const eta = latestPosition?.eta ? formatEta(latestPosition.eta) : null;
    const gt = vessel.grossTonnage ? vessel.grossTonnage.toLocaleString() : null;
    const yearBuilt = vessel.yearBuilt;

    // 속력 / 방위
    const sog = latestPosition?.sog != null ? `${latestPosition.sog.toFixed(1)}kn` : '--kn';
    const hdg = latestPosition?.heading != null
        ? formatDeg(latestPosition.heading)
        : latestPosition?.cog != null
            ? formatDeg(latestPosition.cog)
            : '---°';

    async function handleFetchHistory(e) {
        e.stopPropagation();
        if (!apiFetch) return;
        setHistoryLoading(true);
        setHistoryResult(null);
        try {
            const res = await apiFetch(`/vessels/${vessel.id}/history`, {
                method: 'POST',
                body: JSON.stringify({ days: historyDays }),
            });
            const data = await res.json();
            if (res.ok) {
                setHistoryResult(`${data.stored}건 저장 (${data.credits_used} 크레딧 소모)`);
                if (onHistoryFetched) onHistoryFetched(vessel.id);
            } else {
                setHistoryResult(`오류: ${data.error}`);
            }
        } catch {
            setHistoryResult('네트워크 오류');
        }
        setHistoryLoading(false);
    }

    function handleGroupChange(newType) {
        onUpdate({ companyType: newType });
        setShowGroupChange(false);
    }

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
            className={`bg-gray-800 rounded-lg py-1.5 px-3 cursor-pointer transition-all border ${isSelected
                ? 'border-blue-500 bg-gray-750'
                : 'border-gray-700 hover:border-gray-500'
                } ${!isVisible ? 'opacity-40 grayscale' : ''}`}
        >
            {/* 헤더 행 */}
            <div className="flex items-center gap-2">
                {/* 색상 점 */}
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: vessel.color }} />

                {/* 선박명 + 숨기기 버튼 */}
                <div className="flex-1 flex items-center min-w-0 pr-1 gap-1">
                    <span className="text-white font-semibold text-sm truncate tracking-tight">
                        {displayName}
                    </span>
                    {/* HRA 배지: 현재 전쟁위험구역 내 위치 */}
                    {latestPosition?.currentZones?.length > 0 && (
                        <span
                            className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-red-700 text-red-100 border border-red-500 leading-none"
                            title={`HRA 구역: ${latestPosition.currentZones.join(', ')}`}
                        >
                            HRA
                        </span>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); if (onToggleVisible) onToggleVisible(); }}
                        className={`p-0.5 rounded transition flex-shrink-0 ${isVisible ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-400'}`}
                        title={isVisible ? '이 선박 숨기기' : '이 선박 표시하기'}
                    >
                        {isVisible ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        )}
                    </button>
                </div>

                {/* 편집 버튼 */}
                <button
                    onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                    className="p-0.5 text-gray-400 hover:text-white rounded transition flex-shrink-0"
                    title="편집"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
            </div>

            {/* 선택 시 확장 영역 */}
            {isSelected && (
                <div className="pl-4 mt-1 space-y-1">
                    {/* 선박 유형 */}
                    {vesselType && (
                        <div className="text-xs text-blue-400 font-medium">{vesselType}</div>
                    )}

                    {/* ── 핵심 동향 정보 ── */}
                    {latestPosition ? (
                        <>
                            {/* SPD / HDG 한 줄 */}
                            <div className="text-xs text-gray-300 font-mono">
                                <span className="text-gray-500 mr-1">SPD</span>
                                <span className="font-semibold text-white">{sog}</span>
                                <span className="text-gray-600 mx-2">/</span>
                                <span className="text-gray-500 mr-1">HDG</span>
                                <span className="font-semibold text-white">{hdg}</span>
                            </div>

                            {/* 목적지 + ETA */}
                            {destination && (
                                <div className="text-xs flex items-center gap-1 text-gray-300">
                                    <span>📍</span>
                                    <span>{destination}</span>
                                    {eta && <span className="text-gray-500">· {eta}</span>}
                                </div>
                            )}

                            {/* 상태 + 선박정보 버튼 */}
                            <div className="flex items-center justify-between">
                                <div className="text-xs">
                                    {stale ? (
                                        <span className="text-red-400">⚠ 신호 없음 · {lastSeen}</span>
                                    ) : (
                                        <span className="text-green-400">● 활성 · {lastSeen}</span>
                                    )}
                                </div>
                                {/* 선박정보 토글 버튼 */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowInfo(v => !v); }}
                                    className={`text-xs px-2 py-0.5 rounded border transition ${showInfo
                                        ? 'bg-blue-700 border-blue-500 text-white'
                                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'
                                        }`}
                                >
                                    ℹ 선박정보
                                </button>
                            </div>

                            {/* 선박 스펙 (토글) */}
                            {showInfo && (
                                <div className="bg-gray-750 rounded p-2 border border-gray-700 text-xs space-y-0.5">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">MMSI</span>
                                        <span className="text-gray-300 font-mono">{vessel.mmsi}</span>
                                    </div>
                                    {vessel.imo && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">IMO</span>
                                            <span className="text-gray-300 font-mono">{vessel.imo}</span>
                                        </div>
                                    )}
                                    {gt && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">GT</span>
                                            <span className="text-gray-300">{gt}</span>
                                        </div>
                                    )}
                                    {vessel.deadweight && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">DWT</span>
                                            <span className="text-gray-300">{vessel.deadweight.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {yearBuilt && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">건조</span>
                                            <span className="text-gray-300">{yearBuilt}년</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">위치</span>
                                        <span className="text-gray-400 font-mono text-xs">
                                            {latestPosition.lat.toFixed(4)}°N {latestPosition.lon.toFixed(4)}°E
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* ── 액션 버튼: 재생 / ETA / 히스토리 / 그룹 ── */}
                            <div className="flex gap-1.5 pt-0.5 flex-wrap">
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onStartPlayback) onStartPlayback(vessel.id); }}
                                    className="flex-1 py-1 bg-gray-700 hover:bg-blue-700 text-gray-400 hover:text-white text-[11px] rounded transition flex items-center justify-center gap-1 border border-gray-600 hover:border-blue-500"
                                    title="DB에 저장된 항적을 재생합니다"
                                >
                                    ▶ 재생
                                </button>
                                {latestPosition && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (onStartEta) onStartEta(vessel.id); }}
                                        className="flex-1 py-1 bg-gray-700 hover:bg-amber-700 text-gray-400 hover:text-amber-100 text-[11px] rounded transition flex items-center justify-center gap-1 border border-gray-600 hover:border-amber-500"
                                        title="지도에서 목적지를 클릭하여 거리/ETA를 계산합니다"
                                    >
                                        🧭 ETA
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowHistory(v => !v); }}
                                    className={`flex-1 py-1 text-[11px] rounded transition flex items-center justify-center gap-1 border ${showHistory ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white hover:border-indigo-500'}`}
                                    title="Datalastic에서 과거 위치 데이터 가져오기"
                                >
                                    📡 히스토리
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowGroupChange(v => !v); }}
                                    className={`flex-1 py-1 text-[11px] rounded transition flex items-center justify-center gap-1 border ${showGroupChange ? 'bg-purple-700 border-purple-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white hover:border-purple-500'}`}
                                >
                                    ⇄ 그룹
                                </button>
                            </div>

                            {/* 히스토리 가져오기 (토글 패널) */}
                            {showHistory && (
                                <div className="bg-gray-750 rounded p-2 border border-gray-700 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={historyDays}
                                            onChange={(e) => { e.stopPropagation(); setHistoryDays(parseInt(e.target.value)); }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="bg-gray-700 text-white text-xs rounded px-1.5 py-1 border border-gray-600 flex-shrink-0"
                                        >
                                            {[1, 3, 5, 7, 14, 30].map(d => (
                                                <option key={d} value={d}>{d}일</option>
                                            ))}
                                        </select>
                                        <span className="text-[10px] text-gray-500">({historyDays} 크레딧)</span>
                                        <button
                                            onClick={handleFetchHistory}
                                            disabled={historyLoading}
                                            className="ml-auto px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white text-xs rounded transition flex-shrink-0"
                                        >
                                            {historyLoading ? '...' : '가져오기'}
                                        </button>
                                    </div>
                                    {historyResult && (
                                        <div className={`text-[10px] ${historyResult.startsWith('오류') || historyResult === '네트워크 오류' ? 'text-red-400' : 'text-green-400'}`}>
                                            {historyResult}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 그룹 변경 (토글 패널) */}
                            {showGroupChange && (
                                <div className="bg-gray-800 border border-gray-600 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                                    {['자사간사', '타사간사', ...customGroups].map(type => {
                                        const isCurrent = (vessel.companyType || '자사간사') === type;
                                        return (
                                            <button
                                                key={type}
                                                onClick={(e) => { e.stopPropagation(); handleGroupChange(type); }}
                                                className={`w-full px-3 py-2 text-xs text-left transition flex items-center gap-2 ${
                                                    isCurrent ? 'bg-blue-700 text-white' : 'hover:bg-gray-700 text-gray-300'
                                                }`}
                                            >
                                                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
                                                {type}
                                                {isCurrent && <span className="ml-auto text-xs">✓ 현재</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {/* 보관 / 삭제 */}
                            <div className="flex gap-2 pt-0.5">
                                <button
                                    onClick={(e) => { e.stopPropagation(); if (onArchive) onArchive(); }}
                                    className="flex-1 py-1 bg-gray-700 hover:bg-amber-700 text-gray-400 hover:text-amber-200 text-[11px] rounded transition flex items-center justify-center gap-1 border border-gray-600 hover:border-amber-600"
                                    title="폴링 중단 후 보관함으로 이동"
                                >
                                    보관
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`"${displayName}"을 삭제하시겠습니까?`))
                                            onDelete();
                                    }}
                                    className="flex-1 py-1 bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white text-[11px] rounded transition flex items-center justify-center gap-1 border border-gray-600 hover:border-red-500"
                                >
                                    삭제
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="text-xs text-gray-500 italic">데이터 대기 중...</div>
                    )}
                </div>
            )}
        </div>
    );
}
