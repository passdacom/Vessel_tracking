import React, { useState } from "react";
import VesselCard from "./VesselCard.jsx";
import ApiUpdateModal from "../ApiUpdateModal.jsx";

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
    showRestrictedZone, onToggleZone, zoneOpacity, onZoneOpacityChange,
    selectedRegions, onClearSelectedRegions }) {

    const activeCount = vessels.filter((v) => {
        const pos = positions[v.id]?.[0];
        return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
    }).length;

    const myVessels = vessels.filter(v => v.companyType !== '타사간사');
    const otherVessels = vessels.filter(v => v.companyType === '타사간사');

    /* 그룹 전체 숨기기/보이기: 그룹 내 모든 선박이 숨겨진 경우 '보이기', 아니면 '숨기기' */
    const toggleGroup = (list) => {
        const allHidden = list.every(v => hiddenVessels.has(v.id));
        list.forEach(v => {
            const isHidden = hiddenVessels.has(v.id);
            if (allHidden && isHidden) onToggleVessel && onToggleVessel(v.id); // 보이기
            if (!allHidden && !isHidden) onToggleVessel && onToggleVessel(v.id); // 숨기기
        });
    };

    const renderVesselList = (list) => list.map((vessel) => (
        <VesselCard key={vessel.id} vessel={vessel}
            latestPosition={positions[vessel.id]?.[0]}
            isSelected={selectedVesselId === vessel.id}
            onSelect={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
            onDelete={() => onDeleteVessel(vessel.id)}
            onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
            onPan={() => onSelectVessel(vessel.id)}
            isVisible={!hiddenVessels.has(vessel.id)}
            onToggleVisible={() => onToggleVessel && onToggleVessel(vessel.id)} />
    ));

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

            <div className="flex-1 overflow-y-auto p-2 space-y-4">
                {vessels.length === 0 ? (
                    <div className="text-center text-gray-500 mt-12 px-4">
                        <p className="text-4xl mb-3">🚢</p>
                        <p className="text-sm font-medium text-gray-400">No vessels registered</p>
                    </div>
                ) : (
                    <>
                        {myVessels.length > 0 && (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-gray-700">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <h3 className="text-gray-300 text-xs font-bold tracking-wide uppercase flex-1">자사간사 ({myVessels.length})</h3>
                                    <button
                                        onClick={() => toggleGroup(myVessels)}
                                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition ${myVessels.every(v => hiddenVessels.has(v.id))
                                            ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                            : 'bg-blue-900/60 text-blue-400 hover:bg-blue-900'
                                            }`}
                                        title={myVessels.every(v => hiddenVessels.has(v.id)) ? '그룹 전체 표시' : '그룹 전체 숨기기'}
                                    >
                                        {myVessels.every(v => hiddenVessels.has(v.id)) ? (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        ) : (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        )}
                                        {myVessels.every(v => hiddenVessels.has(v.id)) ? '표시' : '숨기기'}
                                    </button>
                                </div>
                                {renderVesselList(myVessels)}
                            </div>
                        )}
                        {otherVessels.length > 0 && (
                            <div className="space-y-1 mt-3">
                                <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-gray-700">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <h3 className="text-gray-300 text-xs font-bold tracking-wide uppercase flex-1">타사간사 ({otherVessels.length})</h3>
                                    <button
                                        onClick={() => toggleGroup(otherVessels)}
                                        className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition ${otherVessels.every(v => hiddenVessels.has(v.id))
                                            ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                            : 'bg-emerald-900/60 text-emerald-400 hover:bg-emerald-900'
                                            }`}
                                        title={otherVessels.every(v => hiddenVessels.has(v.id)) ? '그룹 전체 표시' : '그룹 전체 숨기기'}
                                    >
                                        {otherVessels.every(v => hiddenVessels.has(v.id)) ? (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        ) : (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        )}
                                        {otherVessels.every(v => hiddenVessels.has(v.id)) ? '표시' : '숨기기'}
                                    </button>
                                </div>
                                {renderVesselList(otherVessels)}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="px-3 py-2.5 border-t border-gray-700">
                <div className="flex flex-col gap-2 relative">
                    <button
                    onClick={onToggleZone}
                    className={`w-full py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${showRestrictedZone ? "bg-red-900 hover:bg-red-800 text-red-200 border border-red-700" : "bg-gray-700 hover:bg-gray-600 text-gray-400"}`}
                    >
                    <span style={{ fontSize: 13 }}>{showRestrictedZone ? "🔴" : "⬜"}</span>
                    War Risk Zone {showRestrictedZone ? "ON" : "OFF"}
                    </button>
                    
                    {/* Opacity Slider */}
                    {showRestrictedZone && (
                      <div className="flex flex-col gap-1 w-full bg-slate-800 p-2 rounded-lg border border-slate-700">
                        {selectedRegions && selectedRegions.length > 0 && (
                            <div className="flex justify-between items-center bg-blue-900/40 px-2 py-1 mb-1 border border-blue-800 rounded">
                                <span className="text-[10px] text-blue-200 font-medium truncate pr-2">
                                  📍 {selectedRegions.length === 1 ? selectedRegions[0] : `${selectedRegions.length}개 구역 선택됨`}
                                </span>
                                <button onClick={onClearSelectedRegions} className="text-[10px] text-blue-400 hover:text-blue-100 flex-shrink-0 font-bold" title="전체 선택으로 돌아가기">✕</button>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-[10px] text-gray-400 font-semibold px-1">
                          <span>{selectedRegions && selectedRegions.length > 0 ? "선택 구역 투명도" : "전체 투명도"}</span>
                          <span>{Math.round(zoneOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={zoneOpacity}
                          onChange={(e) => onZoneOpacityChange(parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
            <div className="px-3 py-3 border-t border-gray-700">
                <button onClick={() => window.print()} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Export / Print Report
                </button>
                <div className="flex gap-1 mt-2">
                    <button onClick={() => window.dispatchEvent(new CustomEvent('open-api-modal'))} className="flex-1 py-1.5 bg-green-900 hover:bg-green-800 border border-green-700 text-green-300 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1">
                        🔄 API 강제 수신
                    </button>
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
    onSelectVessel, selectedVesselId, wsConnected,
    hiddenVessels = new Set(), onToggleVessel, onToggleAllVessels,
    showRestrictedZone, onToggleZone, zoneOpacity, onZoneOpacityChange,
    selectedRegions, onClearSelectedRegions }) {

    const [open, setOpen] = useState(false);

    const activeCount = vessels.filter((v) => {
        const pos = positions[v.id]?.[0];
        return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
    }).length;

    const myVessels = vessels.filter(v => v.companyType !== '타사간사');
    const otherVessels = vessels.filter(v => v.companyType === '타사간사');

    const renderVesselList = (list) => list.map((vessel) => (
        <VesselCard key={vessel.id} vessel={vessel}
            latestPosition={positions[vessel.id]?.[0]}
            isSelected={selectedVesselId === vessel.id}
            onSelect={() => { onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id); setOpen(false); }}
            onDelete={() => onDeleteVessel(vessel.id)}
            onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
            onPan={() => { onSelectVessel(vessel.id); setOpen(false); }}
            isVisible={!hiddenVessels.has(vessel.id)}
            onToggleVisible={() => onToggleVessel && onToggleVessel(vessel.id)} />
    ));

    return (
        <>
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

            <div style={{
                position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1050,
                background: "#111827",
                borderTop: "2px solid #374151",
                borderRadius: "16px 16px 0 0",
                maxHeight: open ? "60vh" : 0,
                overflow: "hidden",
                transition: "max-height 0.3s ease",
                boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
                display: "flex",
                flexDirection: "column"
            }}>
                <div style={{ padding: "12px 12px 6px", borderBottom: "1px solid #374151", flexShrink: 0 }}>
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

                {vessels.length > 0 && (
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #374151", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                        <button onClick={onToggleAllVessels} style={{
                            background: hiddenVessels.size === vessels.length ? "#374151" : "#2563eb",
                            color: "#fff", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer"
                        }}>
                            {hiddenVessels.size === vessels.length ? "전체 표시" : "전체 숨기기"}
                        </button>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>
                            {vessels.length - hiddenVessels.size}/{vessels.length} 표시중
                        </span>
                    </div>
                )}

                <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
                    {vessels.length === 0 ? (
                        <div style={{ textAlign: "center", color: "#6b7280", paddingTop: 24 }}>
                            <p style={{ fontSize: 32 }}>🚢</p>
                            <p style={{ fontSize: 13 }}>No vessels registered</p>
                        </div>
                    ) : (
                        <>
                            {myVessels.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #374151' }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }}></div>
                                        <h3 style={{ color: '#d1d5db', fontSize: 12, fontWeight: 700, margin: 0, textTransform: 'uppercase' }}>자사간사 ({myVessels.length})</h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {renderVesselList(myVessels)}
                                    </div>
                                </div>
                            )}
                            {otherVessels.length > 0 && (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #374151' }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div>
                                        <h3 style={{ color: '#d1d5db', fontSize: 12, fontWeight: 700, margin: 0, textTransform: 'uppercase' }}>타사간사 ({otherVessels.length})</h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {renderVesselList(otherVessels)}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ padding: "8px 12px", borderTop: "1px solid #374151", flexShrink: 0, display: "flex", gap: "6px" }}>
                    <button onClick={() => window.print()} style={{
                        flex: 1, padding: "8px", background: "#374151",
                        color: "#d1d5db", border: "none", borderRadius: 8,
                        fontSize: 12, fontWeight: 600, cursor: "pointer"
                    }}>🖨 Print</button>
                    <button onClick={() => window.dispatchEvent(new CustomEvent('open-api-modal'))} style={{
                        flex: 1, padding: "8px", background: "#065f46",
                        color: "#6ee7b7", border: "1px solid #047857", borderRadius: 8,
                        fontSize: 12, fontWeight: 600, cursor: "pointer"
                    }}>🔄 강제 수신</button>
                </div>
            </div>
        </>
    );
}

/* ── 메인 export: 화면 너비에 따라 자동 분기 ── */
export default function Sidebar(props) {
    const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
    const [showApiModal, setShowApiModal] = React.useState(false);

    React.useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);

    React.useEffect(() => {
        const handleOpenApiModal = () => setShowApiModal(true);
        window.addEventListener('open-api-modal', handleOpenApiModal);
        return () => window.removeEventListener('open-api-modal', handleOpenApiModal);
    }, []);

    // API 업데이트 완료 시 /positions 등을 다시 불러올 수 있도록 처리 필요 시 App.jsx의 apiFetch 사용
    // 위 DesktopSidebar, MobileDrawer에서는 apiFetch 프롭스가 없어서
    // App.jsx에서 관리하는 fetchPositions를 호출해야 하므로,
    // 간단히 이벤트를 발생시키거나 모달 닫힐 때 새로고침 혹은 onRefresh prop 등을 부르면 됨.

    return (
        <>
            {isMobile ? <MobileDrawer {...props} /> : <DesktopSidebar {...props} />}
            {showApiModal && (
                <ApiUpdateModal
                    onClose={() => setShowApiModal(false)}
                    apiFetch={props.apiFetch}
                    vessels={props.vessels || []}
                />
            )}
        </>
    );
}
