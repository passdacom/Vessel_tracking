import React, { useState } from "react";
import VesselCard from "./VesselCard.jsx";

const TRACK_OPTIONS = [
  { label: "1h", value: 1 },
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "7d", value: 168 },
  { label: "30d", value: 720 },
];

/* ── 데스크탑: 기존 사이드바 ── */
function DesktopSidebar({ vessels, positions, trackHours, onTrackHoursChange,
  onAddVessel, onManualEntry, onDeleteVessel, onUpdateVessel,
  onSelectVessel, selectedVesselId, wsConnected,
  onShowShare, onLogout,
  hiddenVessels = new Set(), onToggleVessel, onToggleAllVessels,
  showRestrictedZone, onToggleZone }) {

  const activeCount = vessels.filter((v) => {
    const pos = positions[v.id]?.[0];
    return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="w-72 h-full flex flex-col bg-gray-900 border-r border-gray-700 shadow-2xl flex-shrink-0 print:hidden">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚓</span>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Vessel Tracker</h1>
              <p className="text-gray-400 text-xs">{activeCount}/{vessels.length} Active</p>
            </div>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} title={wsConnected ? "Connected" : "Disconnected"} />
        </div>
        <div className="flex gap-2 mb-2">
          <button onClick={onAddVessel} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Vessel
          </button>
          <button onClick={onManualEntry} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            Manual Entry
          </button>
        </div>
      </div>
      <div className="px-3 py-2.5 border-b border-gray-700">
        <p className="text-gray-400 text-xs mb-2">Track Period</p>
        <div className="flex gap-1">
          {TRACK_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => onTrackHoursChange(opt.value)}
              className={`flex-1 py-1 text-xs rounded transition ${trackHours === opt.value ? "bg-blue-600 text-white font-medium" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {vessels.length > 0 && (
        <div className="px-2 py-1.5 border-b border-gray-700 flex items-center gap-2">
          <button
            onClick={onToggleAllVessels}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${hiddenVessels.size === vessels.length
                ? "bg-gray-700 hover:bg-gray-600 text-gray-400"
                : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {hiddenVessels.size === vessels.length
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
              }
            </svg>
            {hiddenVessels.size === vessels.length ? "전체 표시" : "전체 숨기기"}
          </button>
          <span className="text-gray-600 text-xs">
            {vessels.length - hiddenVessels.size}/{vessels.length} 표시중
          </span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {vessels.length === 0 ? (
          <div className="text-center text-gray-500 mt-12 px-4">
            <p className="text-4xl mb-3">🚢</p>
            <p className="text-sm font-medium text-gray-400">No vessels registered</p>
          </div>
        ) : (
          vessels.map((vessel) => (
            <VesselCard key={vessel.id} vessel={vessel}
              latestPosition={positions[vessel.id]?.[0]}
              isSelected={selectedVesselId === vessel.id}
              onSelect={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
              onDelete={() => onDeleteVessel(vessel.id)}
              onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
              onPan={() => onSelectVessel(vessel.id)}
              isVisible={!hiddenVessels.has(vessel.id)}
              onToggleVisible={() => onToggleVessel && onToggleVessel(vessel.id)} />
          ))
        )}
      </div>
      <div style={{ padding: "8px 12px 4px", borderTop: "1px solid #374151" }}>
        <button
          onClick={onToggleZone}
          className={`w-full py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${showRestrictedZone ? "bg-red-900 hover:bg-red-800 text-red-200 border border-red-700" : "bg-gray-700 hover:bg-gray-600 text-gray-400"}`}
        >
          <span style={{ fontSize: 13 }}>{showRestrictedZone ? "🔴" : "⬜"}</span>
          War Risk Zone {showRestrictedZone ? "ON" : "OFF"}
        </button>
      </div>
      <div className="px-3 py-3 border-t border-gray-700">
        <button onClick={() => window.print()} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Export / Print Report
        </button>
        <div className="flex gap-1 mt-2">
          <button onClick={onShowShare} className="flex-1 py-1.5 bg-blue-900 hover:bg-blue-800 border border-blue-700 text-blue-300 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1">
            🔗 공유 링크
          </button>
          <button onClick={onLogout} className="py-1.5 px-2 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded-lg transition" title="로그아웃">
            🔓
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 모바일: 하단 드로어 ── */
function MobileDrawer({ vessels, positions, trackHours, onTrackHoursChange,
  onAddVessel, onManualEntry, onDeleteVessel, onUpdateVessel,
  onSelectVessel, selectedVesselId, wsConnected }) {

  const [open, setOpen] = useState(false);

  const activeCount = vessels.filter((v) => {
    const pos = positions[v.id]?.[0];
    return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
  }).length;

  return (
    <>
      {/* 상단 미니 툴바 (항상 표시) */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1100,
        background: "rgba(17,24,39,0.95)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid #374151"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>⚓</span>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Vessel Tracker</div>
            <div style={{ color: "#9ca3af", fontSize: 10 }}>{activeCount}/{vessels.length} Active</div>
          </div>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: wsConnected ? "#4ade80" : "#f87171", marginLeft: 4
          }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onAddVessel} style={{
            background: "#2563eb", color: "#fff", border: "none", borderRadius: 8,
            padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>+ Add</button>
          <button onClick={onManualEntry} style={{
            background: "#059669", color: "#fff", border: "none", borderRadius: 8,
            padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>✏️</button>
          <button onClick={() => setOpen(v => !v)} style={{
            background: open ? "#4b5563" : "#1f2937",
            color: "#fff", border: "1px solid #6b7280",
            borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>
            {open ? "▼ Hide" : "▲ Vessels"}
          </button>
        </div>
      </div>

      {/* 하단 드로어 패널 */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1050,
        background: "#111827",
        borderTop: "2px solid #374151",
        borderRadius: "16px 16px 0 0",
        maxHeight: open ? "60vh" : 0,
        overflow: "hidden",
        transition: "max-height 0.3s ease",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.5)"
      }}>
        {/* 트랙 기간 */}
        <div style={{ padding: "12px 12px 6px", borderBottom: "1px solid #374151" }}>
          <p style={{ color: "#9ca3af", fontSize: 11, marginBottom: 6 }}>Track Period</p>
          <div style={{ display: "flex", gap: 6 }}>
            {TRACK_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => onTrackHoursChange(opt.value)}
                style={{
                  flex: 1, padding: "5px 0", fontSize: 11, borderRadius: 6, border: "none",
                  cursor: "pointer", fontWeight: trackHours === opt.value ? 700 : 400,
                  background: trackHours === opt.value ? "#2563eb" : "#374151",
                  color: trackHours === opt.value ? "#fff" : "#d1d5db"
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 선박 카드 리스트 */}
        <div style={{ overflowY: "auto", maxHeight: "calc(60vh - 100px)", padding: "8px" }}>
          {vessels.length === 0 ? (
            <div style={{ textAlign: "center", color: "#6b7280", paddingTop: 24 }}>
              <p style={{ fontSize: 32 }}>��</p>
              <p style={{ fontSize: 13 }}>No vessels registered</p>
            </div>
          ) : (
            vessels.map((vessel) => (
              <VesselCard key={vessel.id} vessel={vessel}
                latestPosition={positions[vessel.id]?.[0]}
                isSelected={selectedVesselId === vessel.id}
                onSelect={() => { onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id); setOpen(false); }}
                onDelete={() => onDeleteVessel(vessel.id)}
                onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
                onPan={() => { onSelectVessel(vessel.id); setOpen(false); }} />
            ))
          )}
        </div>

        {/* 인쇄 버튼 */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid #374151" }}>
          <button onClick={() => window.print()} style={{
            width: "100%", padding: "8px", background: "#374151",
            color: "#d1d5db", border: "none", borderRadius: 8,
            fontSize: 12, fontWeight: 600, cursor: "pointer"
          }}>🖨 Export / Print Report</button>
        </div>
      </div>
    </>
  );
}

/* ── 메인 export: 화면 너비에 따라 자동 분기 ── */
export default function Sidebar(props) {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (isMobile) return <MobileDrawer {...props} />;
  return <DesktopSidebar {...props} />;
}
