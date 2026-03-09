import React, { useState } from 'react';

// 국기 이모지 변환 (사용하지 않으므로 삭제 처리)

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
    isVisible = true,
    onToggleVisible,
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
    const vesselType = vessel.typeSpecific || vessel.vesselType || null;
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
            className={`bg-gray-800 rounded-lg py-1.5 px-3 cursor-pointer transition-all border ${isSelected
                ? 'border-blue-500 bg-gray-750'
                : 'border-gray-700 hover:border-gray-500'
                } ${!isVisible ? 'opacity-40 grayscale' : ''}`}
        >
            {/* 헤더 행 */}
            <div className="flex items-center gap-2">
                {/* 색상 점 */}
                <div className="relative flex-shrink-0">
                    <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: vessel.color }}
                    />
                </div>

                {/* 선박명 + 숨기기 버튼 */}
                <div className="flex-1 flex items-center min-w-0 pr-1">
                    <span className="text-white font-semibold text-sm truncate tracking-tight mr-1">
                        {displayName}
                    </span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleVisible) onToggleVisible();
                        }}
                        className={`p-0.5 rounded transition flex-shrink-0 ${isVisible ? 'text-blue-400 hover:text-blue-300' : 'text-gray-500 hover:text-gray-400'}`}
                        title={isVisible ? "이 선박 숨기기" : "이 선박 표시하기"}
                    >
                        {isVisible ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        )}
                    </button>
                </div>

                {/* 편집 버튼 */}
                <div className="flex flex-shrink-0 ml-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditing(true);
                        }}
                        className="p-0.5 text-gray-400 hover:text-white rounded transition"
                        title="편집"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* 선박 상세 정보 (isSelected일 때만) */}
            {isSelected && (
                <>
                    {/* 선박 유형 + MMSI */}
                    <div className="pl-5 flex items-center gap-2 mb-2 flex-wrap">
                        {vesselType && (
                            <span className="text-xs text-blue-400 font-medium">{vesselType}</span>
                        )}
                        {vesselType && <span className="text-gray-600 text-xs">·</span>}
                        <span className="text-gray-500 text-xs">MMSI {vessel.mmsi}</span>
                    </div>

                    {/* 위치 데이터 */}
                    {latestPosition ? (
                        <div className="pl-5 space-y-1">
                            {/* 속력 / 항로 */}
                            <div className="grid grid-cols-2 gap-x-3 text-xs">
                                <span className="text-gray-400">속력</span>
                                <span className="text-gray-200 font-medium">
                                    {latestPosition.sog != null
                                        ? `${latestPosition.sog.toFixed(1)} kn`
                                        : '-'}
                                </span>
                                <span className="text-gray-400">항로</span>
                                <span className="text-gray-200 font-medium">
                                    {latestPosition.cog != null
                                        ? `${latestPosition.cog.toFixed(0)}°`
                                        : '-'}
                                </span>
                            </div>

                            {/* 목적지 + ETA */}
                            {destination && (
                                <div className="text-xs flex items-start gap-1 mt-0.5">
                                    <span className="text-gray-400 flex-shrink-0">📍</span>
                                    <div className="min-w-0">
                                        <span className="text-gray-200">{destination}</span>
                                        {eta && (
                                            <span className="text-gray-500"> · ⏱ {eta}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* GT + 건조년도 */}
                            {(gt || yearBuilt) && (
                                <div className="text-xs text-gray-500 flex gap-2 flex-wrap">
                                    {gt && <span>GT {gt}</span>}
                                    {gt && yearBuilt && <span>·</span>}
                                    {yearBuilt && <span>{yearBuilt}년 건조</span>}
                                </div>
                            )}

                            {/* 상태 표시 (마지막 줄) */}
                            <div className="text-xs mt-0.5">
                                {stale ? (
                                    <span className="text-red-400">⚠ 신호 없음 · {lastSeen}</span>
                                ) : (
                                    <span className="text-green-400">● 활성 · {lastSeen}</span>
                                )}
                            </div>
                            {/* 하단 버튼 그룹 (지도로 이동 + 삭제) */}
                            <div className="mt-3 flex gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (onPan) onPan();
                                    }}
                                    className="flex-1 py-1.5 bg-gray-700 hover:bg-blue-600 text-blue-300 hover:text-white text-xs rounded transition flex items-center justify-center gap-1 border border-gray-600 hover:border-blue-500"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                    </svg>
                                    이동
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`"${displayName}"을 반환(삭제)하시겠습니까?`))
                                            onDelete();
                                    }}
                                    className="py-1.5 px-3 bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white text-xs rounded transition flex items-center justify-center border border-gray-600 hover:border-red-500"
                                    title="이 선박 삭제"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    삭제
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="pl-5 text-xs text-gray-500 italic">
                            데이터 대기 중...
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
