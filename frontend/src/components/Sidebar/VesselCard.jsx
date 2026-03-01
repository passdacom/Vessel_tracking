import React, { useState } from 'react';

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

function timeSince(timestamp) {
  if (!timestamp) return null;
  const secs = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (secs < 60) return `${secs}초 전`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function isStale(timestamp) {
  if (!timestamp) return true;
  return Date.now() - new Date(timestamp) > 2 * 60 * 60 * 1000;
}

export default function VesselCard({ vessel, latestPosition, isSelected, onSelect, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(vessel.alias || '');
  const [color, setColor] = useState(vessel.color);

  const displayName = vessel.alias || vessel.name || vessel.mmsi;
  const stale = isStale(latestPosition?.timestamp);
  const lastSeen = timeSince(latestPosition?.timestamp);

  const handleSave = () => {
    onUpdate({ alias: alias.trim() || null, color });
    setEditing(false);
  };

  const handleCancel = () => {
    setAlias(vessel.alias || '');
    setColor(vessel.color);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 border border-blue-500">
        <input
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="별칭 (선택)"
          className="w-full px-2 py-1.5 rounded bg-gray-700 text-white text-sm border border-gray-600 focus:border-blue-400 focus:outline-none mb-2"
        />
        <div className="mb-2">
          <p className="text-gray-400 text-xs mb-1.5">색상 선택</p>
          <div className="flex gap-1.5 flex-wrap">
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

  return (
    <div
      onClick={onSelect}
      className={`bg-gray-800 rounded-lg p-3 cursor-pointer transition-all border ${
        isSelected ? 'border-blue-500 bg-gray-750' : 'border-gray-700 hover:border-gray-500'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-1">
        {/* Color dot with status indicator */}
        <div className="relative flex-shrink-0">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: vessel.color }} />
          {stale && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />
          )}
        </div>

        <span className="text-white font-medium text-sm truncate flex-1">{displayName}</span>

        {/* Action buttons */}
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1 text-gray-400 hover:text-white rounded transition"
            title="편집"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`"${displayName}"을 삭제하시겠습니까?`)) onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-400 rounded transition"
            title="삭제"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* MMSI */}
      <div className="text-gray-500 text-xs mb-2 pl-5">MMSI: {vessel.mmsi}</div>

      {/* Position data */}
      {latestPosition ? (
        <div className="pl-5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          <span className="text-gray-400">속력</span>
          <span className="text-gray-200 font-medium">
            {latestPosition.sog?.toFixed(1) ?? '-'} kn
          </span>
          <span className="text-gray-400">항로</span>
          <span className="text-gray-200 font-medium">
            {latestPosition.cog?.toFixed(0) ?? '-'}°
          </span>
          <span className="text-gray-500 col-span-2 mt-1">
            {stale ? (
              <span className="text-red-400">⚠ 신호 없음 · {lastSeen}</span>
            ) : (
              <span className="text-green-400">● 활성 · {lastSeen}</span>
            )}
          </span>
        </div>
      ) : (
        <div className="pl-5 text-xs text-gray-500 italic">AIS 신호 대기 중...</div>
      )}
    </div>
  );
}
