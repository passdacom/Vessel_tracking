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

    const myVessels = vessels.filter(v => v.companyType !== '타사간사');
    const otherVessels = vessels.filter(v => v.companyType === '타사간사');

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
        <div className="w-80 h-full flex flex-col bg-crise-bg border-r border-slate-800 shadow-2xl flex-shrink-0 print:hidden relative z-[9999]">
            <div className="p-5 border-b border-slate-800 relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-amber-500"></div>
                <div className="flex items-center justify-between mb-4 mt-2">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                            <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75"></div>
                        </div>
                        <div>
                            <h1 className="text-white font-black text-xl tracking-wider leading-tight">HORMUZ CRISIS</h1>
                            <p className="text-slate-400 text-[10px] tracking-wider uppercase mt-1">Regional Incident Monitor</p>
                        </div>
                    </div>
                    {wsConnected && (
                        <div className="px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-[10px] font-bold text-red-400 tracking-wider">
                            ACTIVE
                        </div>
                    )}
                </div>
                {/* Add Vessel / Manual Entry (admin only or hidden, kept for functionality but styled darK) */}
                <div className="flex gap-2">
                    <button onClick={onAddVessel} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-semibold rounded transition flex items-center justify-center gap-1 uppercase tracking-wider">
                        + Add
                    </button>
                    <button onClick={onManualEntry} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-semibold rounded transition flex items-center justify-center gap-1 uppercase tracking-wider">
                        ✏️ Edit
                    </button>
                </div>
            </div>

            <div className="px-5 py-3 border-b border-slate-800">
                <p className="text-slate-500 text-[10px] tracking-wider uppercase mb-2 font-semibold">Time Window</p>
                <div className="flex gap-1.5">
                    {TRACK_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => onTrackHoursChange(opt.value)}
                            className={`flex-1 py-1.5 text-[10px] uppercase tracking-wider rounded transition ${trackHours === opt.value ? "bg-red-500 text-white font-bold" : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
            {vessels.length > 0 && (
                <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-2">
                    <button
                        onClick={onToggleAllVessels}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider transition-all ${hiddenVessels.size === vessels.length
                            ? "bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700"
                            : "bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
                            }`}
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {hiddenVessels.size === vessels.length
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                            }
                        </svg>
                        {hiddenVessels.size === vessels.length ? "SHOW ALL" : "HIDE ALL"}
                    </button>
                    <span className="text-slate-500 text-[10px] font-mono">
                        {vessels.length - hiddenVessels.size}/{vessels.length} VISIBLE
                    </span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {vessels.length === 0 ? (
                    <div className="text-center text-gray-500 mt-12 px-4">
                        <p className="text-4xl mb-3">🚢</p>
                        <p className="text-sm font-medium text-gray-400">No vessels registered</p>
                    </div>
                ) : (
                    <>
                        {myVessels.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-gray-700">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <h3 className="text-gray-300 text-xs font-bold tracking-wide uppercase">자사간사 ({myVessels.length})</h3>
                                </div>
                                {renderVesselList(myVessels)}
                            </div>
                        )}
                        {otherVessels.length > 0 && (
                            <div className="space-y-2 mt-4">
                                <div className="flex items-center gap-1.5 px-1 pb-1 border-b border-gray-700">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <h3 className="text-gray-300 text-xs font-bold tracking-wide uppercase">타사간사 ({otherVessels.length})</h3>
                                </div>
                                {renderVesselList(otherVessels)}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div style={{ padding: "12px 16px 8px", borderTop: "1px solid #1E293B" }}>
                <button
                    onClick={onToggleZone}
                    className={`w-full py-2.5 text-[10px] font-bold tracking-wider uppercase rounded transition flex items-center justify-center gap-2 ${showRestrictedZone ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]" : "bg-slate-800 hover:bg-slate-700 text-slate-500 border border-slate-700"}`}
                >
                    <span className="text-[14px]">{showRestrictedZone ? "🔴" : "⚪"}</span>
                    War Risk Zone {showRestrictedZone ? "ON" : "OFF"}
                </button>
            </div>
            <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/50">
                <button onClick={() => window.print()} className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded transition flex items-center justify-center gap-2 mb-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Print Report
                </button>
                <div className="flex gap-2">
                    <button onClick={onShowShare} className="flex-1 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 text-[10px] font-bold uppercase tracking-wider rounded transition flex items-center justify-center gap-1.5">
                        🔗 Share
                    </button>
                    <button onClick={onLogout} className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 text-xs rounded transition flex items-center justify-center" title="로그아웃">
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

    const myVessels = vessels.filter(v => v.companyType !== '타사간사');
    const otherVessels = vessels.filter(v => v.companyType === '타사간사');

    const renderVesselList = (list) => list.map((vessel) => (
        <VesselCard key={vessel.id} vessel={vessel}
            latestPosition={positions[vessel.id]?.[0]}
            isSelected={selectedVesselId === vessel.id}
            onSelect={() => { onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id); setOpen(false); }}
            onDelete={() => onDeleteVessel(vessel.id)}
            onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
            onPan={() => { onSelectVessel(vessel.id); setOpen(false); }} />
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

                <div style={{ padding: "8px 12px", borderTop: "1px solid #374151", flexShrink: 0 }}>
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
