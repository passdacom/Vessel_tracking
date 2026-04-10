import React, { useState } from "react";
import VesselCard from "./VesselCard.jsx";
import ApiUpdateModal from "../ApiUpdateModal.jsx";
import ArchivedVesselsModal from "../ArchivedVesselsModal.jsx";
import PortList from "./PortList.jsx";

// 빠른 선택 버튼 (자주 사용)
const TRACK_QUICK = [
    { label: "6h", value: 6 },
    { label: "24h", value: 24 },
    { label: "3d", value: 72 },
    { label: "7d", value: 168 },
];
// 드롭다운 전체 옵션
const TRACK_ALL = [
    { label: "1시간", value: 1 },
    { label: "3시간", value: 3 },
    { label: "6시간", value: 6 },
    { label: "12시간", value: 12 },
    { label: "24시간", value: 24 },
    { label: "2일", value: 48 },
    { label: "3일", value: 72 },
    { label: "5일", value: 120 },
    { label: "7일", value: 168 },
    { label: "14일", value: 336 },
    { label: "30일", value: 720 },
];

/* ── 데스크탑: 기존 사이드바 ── */
function DesktopSidebar({ vessels, positions, trackHours, onTrackHoursChange,
    onAddVessel, onManualEntry, onDeleteVessel, onUpdateVessel, onArchiveVessel, onRestoreVessel,
    onSelectVessel, selectedVesselId, wsConnected,
    onShowShare, onLogout, onOpenSettings, onOpenGuide, onManageGroups,
    hiddenVessels = new Set(), onToggleVessel, onToggleAllVessels,
    showLabels = true, onToggleLabels,
    customGroups = [],
    apiFetch, selectedPort, onSelectPort, onStartPlayback, onHistoryFetched, onOpenZoneSettings,
    sidebarWidth = 288 }) {

    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const [showArchiveModal, setShowArchiveModal] = useState(false);

    const toggleCollapse = (groupName, e) => {
        // Prevent toggle when clicking the "Hide/Show Group" button inside the header
        if (e && e.target.closest('button')) return;
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    };

    const activeVessels = vessels.filter(v => v.active !== false);
    const archivedCount = vessels.filter(v => v.active === false).length;

    const activeCount = activeVessels.filter((v) => {
        const pos = positions[v.id]?.[0];
        return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
    }).length;

    // Build dynamic groups based on companyType + customGroups (active vessels only)
    const groupMap = {};
    const allGroupNames = new Set(["자사간사", "타사간사", ...customGroups]);

    activeVessels.forEach(v => {
        const gLabel = v.companyType || "자사간사";
        allGroupNames.add(gLabel);
        if (!groupMap[gLabel]) groupMap[gLabel] = [];
        groupMap[gLabel].push(v);
    });

    const sortedGroups = Array.from(allGroupNames).sort().map(gLabel => {
        return {
            name: gLabel,
            list: groupMap[gLabel] || []
        };
    });

    /* 그룹 전체 숨기기/보이기: 그룹 내 모든 선박이 숨겨진 경우 '보이기', 아니면 '숨기기' */
    const toggleGroup = (list) => {
        const allHidden = list.every(v => hiddenVessels.has(v.id));
        list.forEach(v => {
            const isHidden = hiddenVessels.has(v.id);
            if (allHidden && isHidden) onToggleVessel && onToggleVessel(v.id); // 보이기
            if (!allHidden && !isHidden) onToggleVessel && onToggleVessel(v.id); // 숨기기
        });
    };

    // VesselCard 드롭다운용 전체 그룹 목록 (기본값 제외, 동적 포함)
    const allCustomGroups = Array.from(allGroupNames).filter(g => g !== '자사간사' && g !== '타사간사');

    const renderVesselList = (list) => list.map((vessel) => (
        <VesselCard key={vessel.id} vessel={vessel}
            latestPosition={positions[vessel.id]?.[0]}
            isSelected={selectedVesselId === vessel.id}
            onSelect={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
            onDelete={() => onDeleteVessel(vessel.id)}
            onArchive={() => onArchiveVessel && onArchiveVessel(vessel.id)}
            onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
            isVisible={!hiddenVessels.has(vessel.id)}
            onToggleVisible={() => onToggleVessel && onToggleVessel(vessel.id)}
            customGroups={allCustomGroups}
            apiFetch={apiFetch}
            onStartPlayback={onStartPlayback}
            onHistoryFetched={onHistoryFetched} />
    ));

    return (
        <div className="h-full flex flex-col bg-gray-900 border-r border-gray-700 shadow-2xl flex-shrink-0 print:hidden" style={{ width: sidebarWidth }}>
            <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">⚓</span>
                        <div>
                            <h1 className="text-white font-bold text-base leading-tight">Vessel Tracker</h1>
                            <p className="text-gray-400 text-xs">{activeCount}/{activeVessels.length} Active</p>
                        </div>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${wsConnected ? "bg-green-400" : "bg-red-400"}`} title={wsConnected ? "Connected" : "Disconnected"} />
                </div>
                <div className="flex gap-2 mb-2">
                    <button onClick={onAddVessel} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add
                    </button>
                    <button onClick={onManualEntry} className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Manual
                    </button>
                    <button onClick={onManageGroups} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded-lg transition flex items-center justify-center gap-1">
                        📂 Groups
                    </button>
                </div>
            </div>

            <div className="px-3 py-2.5 border-b border-gray-700">
                <div className="flex items-center gap-1.5">
                    {TRACK_QUICK.map((opt) => (
                        <button key={opt.value} onClick={() => onTrackHoursChange(opt.value)}
                            className={`flex-1 py-1 text-xs rounded transition ${trackHours === opt.value ? "bg-blue-600 text-white font-medium" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                            {opt.label}
                        </button>
                    ))}
                    <select
                        value={TRACK_QUICK.some(o => o.value === trackHours) ? "" : trackHours}
                        onChange={(e) => { if (e.target.value) onTrackHoursChange(parseInt(e.target.value)); }}
                        className={`w-14 py-1 text-xs rounded border text-center cursor-pointer ${
                            !TRACK_QUICK.some(o => o.value === trackHours)
                                ? "bg-blue-600 text-white border-blue-500 font-medium"
                                : "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600"
                        }`}
                    >
                        <option value="" disabled hidden>+</option>
                        {TRACK_ALL.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>
            <PortList apiFetch={apiFetch} onSelectPort={onSelectPort} selectedPort={selectedPort} />

            {activeVessels.length > 0 && (
                <div className="px-2 py-1.5 border-b border-gray-700 flex items-center gap-2">
                    <button
                        onClick={onToggleAllVessels}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${activeVessels.every(v => hiddenVessels.has(v.id))
                            ? "bg-gray-700 hover:bg-gray-600 text-gray-400"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                            }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {activeVessels.every(v => hiddenVessels.has(v.id))
                                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                            }
                        </svg>
                        {activeVessels.every(v => hiddenVessels.has(v.id)) ? "전체 표시" : "전체 숨기기"}
                    </button>
                    {/* 라벨 숨기기/표시 토글 */}
                    <button
                        onClick={onToggleLabels}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${showLabels
                            ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                            : "bg-gray-800 hover:bg-gray-700 text-gray-500 line-through"
                            }`}
                        title={showLabels ? "선박명 라벨 숨기기" : "선박명 라벨 표시"}
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        라벨
                    </button>

                    <span className="text-gray-600 text-xs ml-auto">
                        {activeVessels.filter(v => !hiddenVessels.has(v.id)).length}/{activeVessels.length} 표시중
                    </span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-2 space-y-4">
                {activeVessels.length === 0 ? (
                    <div className="text-center text-gray-500 mt-12 px-4">
                        <p className="text-4xl mb-3">🚢</p>
                        <p className="text-sm font-medium text-gray-400">No vessels registered</p>
                    </div>
                ) : (
                    <>
                        {sortedGroups.map((group, idx) => {
                            if (group.list.length === 0) return null; // 빈 그룹은 사이드바에 표시 안함
                            
                            const isCollapsed = collapsedGroups.has(group.name);
                            const allHidden = group.list.every(v => hiddenVessels.has(v.id));

                            // Color assignment logic (simple deterministic hash for colors or defaults)
                            let bulletColor = "bg-blue-500";
                            let btnBg = "bg-blue-900/60";
                            let btnHover = "hover:bg-blue-900";
                            let btnText = "text-blue-400";
                            if (group.name === "타사간사") {
                                bulletColor = "bg-emerald-500"; btnBg = "bg-emerald-900/60"; btnHover = "hover:bg-emerald-900"; btnText = "text-emerald-400";
                            } else if (idx % 3 === 1) {
                                bulletColor = "bg-purple-500"; btnBg = "bg-purple-900/60"; btnHover = "hover:bg-purple-900"; btnText = "text-purple-400";
                            } else if (idx % 3 === 2) {
                                bulletColor = "bg-amber-500"; btnBg = "bg-amber-900/60"; btnHover = "hover:bg-amber-900"; btnText = "text-amber-400";
                            }

                            return (
                                <div key={group.name} className="space-y-1 mb-3">
                                    <div 
                                        onClick={(e) => toggleCollapse(group.name, e)}
                                        className="flex items-center gap-1.5 px-1 pb-1 border-b border-gray-700 cursor-pointer hover:bg-gray-800 transition rounded"
                                    >
                                        <div className="flex items-center justify-center w-4 h-4 text-gray-500 text-xs">
                                            {isCollapsed ? "▶" : "▼"}
                                        </div>
                                        <div className={`w-2 h-2 rounded-full ${bulletColor}`}></div>
                                        <h3 className="text-gray-300 text-xs font-bold tracking-wide uppercase flex-1 truncate select-none">
                                            {group.name} ({group.list.length})
                                        </h3>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleCollapse(group.name); toggleGroup(group.list); }}
                                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition select-none ${allHidden
                                                ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                                : `${btnBg} ${btnText} ${btnHover}`
                                                }`}
                                            title={allHidden ? '그룹 전체 표시' : '그룹 전체 숨기기'}
                                        >
                                            {allHidden ? (
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            ) : (
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            )}
                                            {allHidden ? '표시' : '숨기기'}
                                        </button>
                                    </div>
                                    {!isCollapsed && renderVesselList(group.list)}
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            {archivedCount > 0 && (
                <div className="px-3 py-1.5 border-t border-gray-800">
                    <button
                        onClick={() => setShowArchiveModal(true)}
                        className="w-full text-left text-gray-600 hover:text-gray-400 text-xs transition flex items-center gap-1.5"
                    >
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8M10 12v4m4-4v4" />
                        </svg>
                        보관함 ({archivedCount}척) ›
                    </button>
                </div>
            )}
            {showArchiveModal && (
                <ArchivedVesselsModal
                    vessels={vessels}
                    onRestore={(id) => { onRestoreVessel && onRestoreVessel(id); }}
                    onDelete={(id) => { onDeleteVessel(id); }}
                    onClose={() => setShowArchiveModal(false)}
                />
            )}

            <div className="px-3 py-2.5 border-t border-gray-700">
                <button
                    onClick={onOpenZoneSettings}
                    className="w-full py-2 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 bg-red-900 hover:bg-red-800 text-red-200 border border-red-700"
                >
                    <span style={{ fontSize: 13 }}>🔴</span>
                    War Risk Zone 설정
                </button>
            </div>
            <div className="px-3 py-3 border-t border-gray-700">
                <button onClick={onOpenGuide} className="w-full py-2 bg-blue-900 hover:bg-blue-800 border border-blue-700 text-blue-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5">
                    📖 사용자 매뉴얼
                </button>
                <div className="flex gap-1 mt-2">
                    <button onClick={() => window.dispatchEvent(new CustomEvent('open-api-modal'))} className="flex-1 py-1.5 bg-green-900 hover:bg-green-800 border border-green-700 text-green-300 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1">
                        🔄 API 강제 수신
                    </button>
                    <button onClick={onShowShare} className="flex-1 py-1.5 bg-blue-900 hover:bg-blue-800 border border-blue-700 text-blue-300 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1">
                        🔗 공유 링크
                    </button>
                    <button onClick={() => window.print()} className="py-1.5 px-2 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded-lg transition" title="Export / Print Report">
                        🖨️
                    </button>
                    <button onClick={onOpenSettings} className="py-1.5 px-2 bg-gray-700 hover:bg-gray-600 text-gray-400 text-xs rounded-lg transition" title="설정">
                        ⚙️
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── 모바일: 하단 드로어 ── */
function MobileDrawer({ vessels, positions, trackHours, onTrackHoursChange,
    onAddVessel, onManualEntry, onDeleteVessel, onUpdateVessel, onArchiveVessel, onRestoreVessel,
    onSelectVessel, selectedVesselId, wsConnected, onManageGroups,
    hiddenVessels = new Set(), onToggleVessel, onToggleAllVessels,
    customGroups = [],
    apiFetch, onStartPlayback, onHistoryFetched, onOpenZoneSettings }) {

    const [open, setOpen] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState(new Set());
    const [showArchiveModal, setShowArchiveModal] = useState(false);

    const toggleCollapse = (groupName, e) => {
        if (e && e.target.closest('button')) return;
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    };

    const activeVessels = vessels.filter(v => v.active !== false);
    const archivedCount = vessels.filter(v => v.active === false).length;

    const activeCount = activeVessels.filter((v) => {
        const pos = positions[v.id]?.[0];
        return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
    }).length;

    // Build dynamic groups based on companyType + customGroups (active vessels only)
    const groupMap = {};
    const allGroupNames = new Set(["자사간사", "타사간사", ...customGroups]);

    activeVessels.forEach(v => {
        const gLabel = v.companyType || "자사간사";
        allGroupNames.add(gLabel);
        if (!groupMap[gLabel]) groupMap[gLabel] = [];
        groupMap[gLabel].push(v);
    });

    const sortedGroups = Array.from(allGroupNames).sort().map(gLabel => {
        return {
            name: gLabel,
            list: groupMap[gLabel] || []
        };
    });

    const allCustomGroups = Array.from(allGroupNames).filter(g => g !== '자사간사' && g !== '타사간사');

    const renderVesselList = (list) => list.map((vessel) => (
        <VesselCard key={vessel.id} vessel={vessel}
            latestPosition={positions[vessel.id]?.[0]}
            isSelected={selectedVesselId === vessel.id}
            onSelect={() => { onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id); setOpen(false); }}
            onDelete={() => onDeleteVessel(vessel.id)}
            onArchive={() => onArchiveVessel && onArchiveVessel(vessel.id)}
            onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
            isVisible={!hiddenVessels.has(vessel.id)}
            onToggleVisible={() => onToggleVessel && onToggleVessel(vessel.id)}
            customGroups={allCustomGroups}
            apiFetch={apiFetch}
            onStartPlayback={onStartPlayback}
            onHistoryFetched={onHistoryFetched} />
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
                        <div style={{ color: "#9ca3af", fontSize: 10 }}>{activeCount}/{activeVessels.length} Active</div>
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
                    <button onClick={onManageGroups} style={{
                        background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
                        padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer"
                    }}>📂</button>
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
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {TRACK_QUICK.map((opt) => (
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
                        <select
                            value={TRACK_QUICK.some(o => o.value === trackHours) ? "" : trackHours}
                            onChange={(e) => { if (e.target.value) onTrackHoursChange(parseInt(e.target.value)); }}
                            style={{
                                width: 48, padding: "5px 2px", fontSize: 11, borderRadius: 6, textAlign: "center",
                                cursor: "pointer", fontWeight: !TRACK_QUICK.some(o => o.value === trackHours) ? 700 : 400,
                                background: !TRACK_QUICK.some(o => o.value === trackHours) ? "#2563eb" : "#374151",
                                color: !TRACK_QUICK.some(o => o.value === trackHours) ? "#fff" : "#d1d5db",
                                border: !TRACK_QUICK.some(o => o.value === trackHours) ? "1px solid #3b82f6" : "1px solid #4b5563",
                            }}
                        >
                            <option value="" disabled hidden>+</option>
                            {TRACK_ALL.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {activeVessels.length > 0 && (
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid #374151", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                        <button onClick={onToggleAllVessels} style={{
                            background: activeVessels.every(v => hiddenVessels.has(v.id)) ? "#374151" : "#2563eb",
                            color: "#fff", border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer"
                        }}>
                            {activeVessels.every(v => hiddenVessels.has(v.id)) ? "전체 표시" : "전체 숨기기"}
                        </button>
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>
                            {activeVessels.filter(v => !hiddenVessels.has(v.id)).length}/{activeVessels.length} 표시중
                        </span>
                    </div>
                )}

                <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
                    {activeVessels.length === 0 ? (
                        <div style={{ textAlign: "center", color: "#6b7280", paddingTop: 24 }}>
                            <p style={{ fontSize: 32 }}>🚢</p>
                            <p style={{ fontSize: 13 }}>No vessels registered</p>
                        </div>
                    ) : (
                        <>
                            {sortedGroups.map((group, idx) => {
                                if (group.list.length === 0) return null; // 빈 그룹 표시 안함
                                const isCollapsed = collapsedGroups.has(group.name);

                                let bulletColor = "#3b82f6";
                                if (group.name === "타사간사") bulletColor = "#10b981";
                                else if (idx % 3 === 1) bulletColor = "#a855f7";
                                else if (idx % 3 === 2) bulletColor = "#f59e0b";

                                return (
                                    <div key={group.name} style={{ marginBottom: 16 }}>
                                        <div 
                                            onClick={(e) => toggleCollapse(group.name, e)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #374151', cursor: 'pointer' }}
                                        >
                                            <div style={{ color: '#6b7280', fontSize: 10, width: 12, textAlign: 'center' }}>
                                                {isCollapsed ? "▶" : "▼"}
                                            </div>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: bulletColor }}></div>
                                            <h3 style={{ color: '#d1d5db', fontSize: 12, fontWeight: 700, margin: 0, textTransform: 'uppercase', flex: 1, userSelect: 'none' }}>
                                                {group.name} ({group.list.length})
                                            </h3>
                                        </div>
                                        {!isCollapsed && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {renderVesselList(group.list)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {archivedCount > 0 && (
                    <div style={{ padding: "4px 12px", borderTop: "1px solid #1f2937", flexShrink: 0 }}>
                        <button
                            onClick={() => setShowArchiveModal(true)}
                            style={{ background: "none", border: "none", color: "#4b5563", fontSize: 11, cursor: "pointer", padding: "4px 0" }}
                        >
                            🗃 보관함 ({archivedCount}척) ›
                        </button>
                    </div>
                )}
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
            {showArchiveModal && (
                <ArchivedVesselsModal
                    vessels={vessels}
                    onRestore={(id) => { onRestoreVessel && onRestoreVessel(id); }}
                    onDelete={(id) => { onDeleteVessel(id); }}
                    onClose={() => setShowArchiveModal(false)}
                />
            )}
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
