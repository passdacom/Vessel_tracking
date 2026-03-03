import React, { useState } from "react";

const COLORS = [
  "#3b82f6","#f59e0b","#10b981","#ef4444","#8b5cf6",
  "#f97316","#06b6d4","#ec4899","#84cc16","#6366f1",
];

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function VesselCard({ vessel, latestPosition, isSelected, onSelect, onDelete, onUpdate, isVisible = true, onToggleVisible }) {
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState(vessel.alias || "");
  const [color, setColor] = useState(vessel.color);

  const displayName = vessel.alias || vessel.name || vessel.mmsi;
  const stale = !latestPosition || Date.now() - new Date(latestPosition.timestamp) > 2 * 60 * 60 * 1000;
  const lastSeen = latestPosition ? timeAgo(latestPosition.timestamp) : null;

  const handleSave = () => {
    onUpdate({ alias, color });
    setEditing(false);
  };

  const handleCancel = () => {
    setAlias(vessel.alias || "");
    setColor(vessel.color);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 border border-blue-500">
        <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)}
          placeholder="Alias (optional)"
          className="w-full px-2 py-1.5 rounded bg-gray-700 text-white text-sm border border-gray-600 focus:border-blue-400 focus:outline-none mb-2" />
        <div className="mb-2">
          <p className="text-gray-400 text-xs mb-1.5">Color</p>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                style={{ backgroundColor: c, outline: color === c ? "2px solid white" : "2px solid transparent", outlineOffset: "2px" }} />
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition">Save</button>
          <button onClick={handleCancel} className="flex-1 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500 transition">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onSelect}
      className={`bg-gray-800 rounded-lg p-3 cursor-pointer transition-all border ${isSelected ? "border-blue-500 bg-gray-750" : "border-gray-700 hover:border-gray-500"}`} style={{ opacity: isVisible ? 1 : 0.45 }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="relative flex-shrink-0">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: vessel.color }} />
          {stale && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500" />}
        </div>
        <span className="text-white font-medium text-sm truncate flex-1">{displayName}</span>
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onToggleVisible && onToggleVisible(); }}
            className="p-1 text-gray-400 hover:text-white rounded transition" title={isVisible ? "지도에서 숨기기" : "지도에 표시"}>
            {isVisible
              ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{opacity:0.4}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
            }
          </button>
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1 text-gray-400 hover:text-white rounded transition" title="Edit">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${displayName}"?`)) onDelete(); }}
            className="p-1 text-gray-400 hover:text-red-400 rounded transition" title="Delete">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <div className="text-gray-500 text-xs mb-2 pl-5">MMSI: {vessel.mmsi}</div>
      {latestPosition ? (
        <div className="pl-5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
          <span className="text-gray-400">Speed</span>
          <span className="text-gray-200 font-medium">{latestPosition.sog?.toFixed(1) ?? "-"} kn</span>
          <span className="text-gray-400">Course</span>
          <span className="text-gray-200 font-medium">{latestPosition.cog?.toFixed(0) ?? "-"}°</span>
          <span className="text-gray-500 col-span-2 mt-1">
            {stale ? (
              <span className="text-red-400">⚠ No signal · {lastSeen}</span>
            ) : (
              <span className="text-green-400">● Active · {lastSeen}</span>
            )}
          </span>
        </div>
      ) : (
        <div className="pl-5 text-xs text-gray-500 italic">Awaiting AIS signal...</div>
      )}
    </div>
  );
}
