import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import LoginPage from "./components/LoginPage.jsx";
import SharePanel from "./components/SharePanel.jsx";
import Map from "./components/Map/index.jsx";
import Sidebar from "./components/Sidebar/index.jsx";
import AddVesselModal from "./components/AddVesselModal.jsx";
import ManualPositionModal from "./components/ManualPositionModal.jsx";
import GroupManageModal from "./components/GroupManageModal.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import LaneManager from "./components/ShippingLanes/LaneManager.jsx";
import EtaPanel from "./components/EtaPanel.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import UserGuide from "./components/UserGuide.jsx";
import { useWebSocket } from "./hooks/useWebSocket.js";
import usePlayback from "./hooks/usePlayback.js";
import PlaybackPanel from "./components/PlaybackPanel.jsx";
import GlobalTimePanel from "./components/GlobalTimePanel.jsx";
import ZoneSettingsPanel from "./components/ZoneSettingsPanel.jsx";
import { clearAuthStorage, createApiFetch, getStoredAuthToken } from "./authSession.js";
import { migrateRiskAreaSettings } from "./riskAreas/riskAreaCatalog.js";

function ReportTable({ vessels, positions }) {
  const now = new Date().toUTCString();
  return (
    <>
      <div className="print-report-header">
        <h1 style={{ fontSize: "18px", fontWeight: "bold", color: "#1e3a5f", margin: 0 }}>Vessel Position Report</h1>
        <p style={{ fontSize: "11px", color: "#555", margin: "4px 0 0" }}>Generated: {now}</p>
      </div>
      <div className="print-report-table">
        <table>
          <thead>
            <tr>
              <th>Vessel Name</th>
              <th>MMSI</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Speed (kn)</th>
              <th>Course (°)</th>
              <th>Heading (°)</th>
              <th>Last Update (UTC)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vessels.map((v) => {
              const pos = positions[v.id]?.[0];
              const stale = !pos || Date.now() - new Date(pos.timestamp) > 2 * 60 * 60 * 1000;
              return (
                <tr key={v.id}>
                  <td style={{ fontWeight: "bold" }}>{v.alias || v.name || v.mmsi}</td>
                  <td>{v.mmsi}</td>
                  <td>{pos ? pos.lat?.toFixed(5) : "-"}</td>
                  <td>{pos ? pos.lon?.toFixed(5) : "-"}</td>
                  <td>{pos?.sog?.toFixed(1) ?? "-"}</td>
                  <td>{pos?.cog?.toFixed(0) ?? "-"}</td>
                  <td>{pos?.heading?.toFixed(0) ?? "-"}</td>
                  <td>{pos ? new Date(pos.timestamp).toUTCString() : "-"}</td>
                  <td style={{ color: stale ? "#dc2626" : "#16a34a", fontWeight: "bold" }}>
                    {!pos ? "No Data" : stale ? "Stale" : "Active"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Zone Event Toast ──────────────────────────────────────────────────────────
function ZoneToast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2 pointer-events-none print:hidden" style={{ maxWidth: "340px" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2 rounded-lg shadow-xl px-3 py-2.5 text-sm text-white animate-fade-in"
          style={{ background: t.eventType === "entry" ? "#b91c1c" : "#15803d" }}
        >
          <span className="text-base mt-0.5">{t.eventType === "entry" ? "🔴" : "🟢"}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{t.vesselName}</div>
            <div className="text-xs opacity-90 truncate">{t.eventType === "entry" ? "진입" : "이탈"}: {t.zoneName}</div>
          </div>
          <button onClick={() => onDismiss(t.id)} className="opacity-70 hover:opacity-100 ml-1 text-xs">✕</button>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [vessels, setVessels] = useState([]);
  const [positions, setPositions] = useState({});
  const [zoneToasts, setZoneToasts] = useState([]);
  const [trackHours, setTrackHours] = useState(24);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showGroupManageModal, setShowGroupManageModal] = useState(false);
  const [selectedVesselId, setSelectedVesselId] = useState(null);
  const [panTrigger, setPanTrigger] = useState(0);
  const [selectedPort, setSelectedPort] = useState(null);
  const [portPanTrigger, setPortPanTrigger] = useState(0);
  // ── 항적 재생 상태 ──
  const [playbackVesselId, setPlaybackVesselId] = useState(null);
  const [playbackFollow, setPlaybackFollow] = useState(true);
  const playback = usePlayback(playbackVesselId ? positions[playbackVesselId] : null);

  const handleStartPlayback = (vesselId) => {
    setGlobalTime(null); // 시간 이동 모드 해제
    setPlaybackVesselId(vesselId);
    setPlaybackFollow(true);
    setSelectedVesselId(vesselId);
  };

  const handleStopPlayback = () => {
    playback.controls.stop();
    setPlaybackVesselId(null);
  };

  // ── 전체 선박 시간 이동 ──
  const [globalTime, setGlobalTime] = useState(null); // Date | null

  // globalTime이 설정된 경우 해당 시각 기준으로 각 선박의 위치 표시
  const displayPositions = useMemo(() => {
    if (!globalTime) return positions;
    const result = {};
    for (const [vesselId, posArray] of Object.entries(positions)) {
      if (!posArray || posArray.length === 0) { result[vesselId] = []; continue; }
      // posArray는 timestamp DESC(최신 순) 정렬
      const before = posArray.filter(p => new Date(p.timestamp) <= globalTime);
      if (before.length > 0) {
        result[vesselId] = before; // globalTime 이전의 위치들 (track + 최신 마커)
      } else {
        // globalTime이 이 선박의 첫 데이터보다 앞인 경우 → 가장 오래된 위치로 고정
        result[vesselId] = [posArray[posArray.length - 1]];
      }
    }
    return result;
  }, [positions, globalTime]);

  const handleSetGlobalTime = (date) => {
    setGlobalTime(date);
    if (date && playbackVesselId) handleStopPlayback(); // 재생 중이면 중단
  };

  // 히스토리 가져오기 후 positions 새로고침
  const handleHistoryFetched = async (vesselId) => {
    const vessel = vessels.find((v) => v.id === vesselId);
    if (vessel) {
      const res = await apiFetch(`/vessels/${vesselId}/positions?hours=${trackHoursRef.current}`);
      if (res.ok) {
        const pos = await res.json();
        setPositions((prev) => ({ ...prev, [vesselId]: pos }));
      }
    }
  };

  const [wsConnected, setWsConnected] = useState(false);
  const [isAuthed, setIsAuthed] = useState(() => {
    const token = localStorage.getItem("vessel_token");
    const tokenExp = localStorage.getItem("vessel_token_expires");
    if (token && tokenExp && Date.now() < parseInt(tokenExp, 10)) return true;
    if (token) {
      localStorage.removeItem("vessel_token");
      localStorage.removeItem("vessel_token_expires");
    }
    localStorage.removeItem("vessel_account");
    localStorage.removeItem("vessel_role");
    return false;
  });
  const [accountName, setAccountName] = useState(() => localStorage.getItem("vessel_account") || "");
  const [accountRole, setAccountRole] = useState(() => localStorage.getItem("vessel_role") || "user");
  const [adminView, setAdminView] = useState("dashboard"); // admin: "dashboard" | "map" | "lane-manager"
  const [showSharePanel, setShowSharePanel] = useState(false);

  // ── 항로 상태 ──
  const [lanes, setLanes] = useState([]);
  const [showLanes, setShowLanes] = useState(true);

  // ── ETA 계산 상태 ──
  const [etaMode, setEtaMode] = useState(false);      // 목적지 클릭 대기 중
  const [etaVesselId, setEtaVesselId] = useState(null); // ETA 계산 대상 선박 ID
  const [etaDestination, setEtaDestination] = useState(null); // { lat, lon }
  const [etaResult, setEtaResult] = useState(null);

  const handleLogin = (account, role, token) => {
    localStorage.setItem("vessel_token", token);
    localStorage.setItem("vessel_token_expires", (Date.now() + 86400000).toString());
    localStorage.setItem("vessel_account", account);
    localStorage.setItem("vessel_role", role);
    setAccountName(account);
    setAccountRole(role);
    setIsAuthed(true);
  };
  const handleLogout = useCallback(() => {
    clearAuthStorage();
    setAccountName("");
    setAccountRole("user");
    setIsAuthed(false);
  }, []);

  const [hiddenVessels, setHiddenVessels] = useState(new Set());
  const [showLabels, setShowLabels] = useState(() => {
    const stored = localStorage.getItem("vessel_show_labels");
    return stored === null ? true : stored === "true"; // 기본값 true
  });
  const handleToggleLabels = () => {
    setShowLabels(prev => {
      localStorage.setItem("vessel_show_labels", String(!prev));
      return !prev;
    });
  };
  const [showZoneSettings, setShowZoneSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  // 계정별 localStorage 키 (계정마다 설정 분리)
  const acctKey = (key) => `${key}_${accountName}`;

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(acctKey("vessel_sidebar_width"));
    return stored ? parseInt(stored, 10) : 288; // 18rem = 288px default
  });
  const [zoneSettings, setZoneSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(acctKey("vessel_zone_settings"));
      return migrateRiskAreaSettings(stored ? JSON.parse(stored) : {});
    } catch { return {}; }
  });
  const [areaFocus, setAreaFocus] = useState(null);
  const handleFocusArea = useCallback((key) => {
    if (!key) return;
    setAreaFocus((previous) => ({ key, requestId: (previous?.requestId || 0) + 1 }));
  }, []);

  // New state for custom groups
  const [customGroups, setCustomGroups] = useState(() => {
    try {
      const stored = localStorage.getItem(acctKey("vessel_custom_groups"));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist custom groups
  useEffect(() => {
    localStorage.setItem(acctKey("vessel_custom_groups"), JSON.stringify(customGroups));
  }, [customGroups, accountName]);

  // Persist zone settings
  useEffect(() => {
    localStorage.setItem(acctKey("vessel_zone_settings"), JSON.stringify(zoneSettings));
  }, [zoneSettings, accountName]);

  const handleAddCustomGroup = (groupName) => {
    if (!groupName) return;
    setCustomGroups(prev => prev.includes(groupName) ? prev : [...prev, groupName]);
  };

  const handleRenameGroup = async (oldName, newName) => {
    if (!newName || oldName === newName) return;
    // 1. Rename in customGroups
    setCustomGroups(prev => prev.map(g => g === oldName ? newName : g));
    
    // 2. Add to custom groups if it's new
    handleAddCustomGroup(newName);

    // 3. Update all vessels in this group
    const vesselsToUpdate = vessels.filter(v => (v.companyType || "자사간사") === oldName);
    await Promise.all(vesselsToUpdate.map(v => 
      apiFetch(`/vessels/${v.id}`, { method: "PATCH", body: JSON.stringify({ companyType: newName }) })
    ));
    
    if (vesselsToUpdate.length > 0) {
      // Refresh vessels to get new companyType (or rely on optimistic update / websocket)
      const updatedVesselRes = await apiFetch("/vessels");
      if (updatedVesselRes.ok) {
        setVessels(await updatedVesselRes.json());
      }
    }
  };

  const handleDeleteGroup = async (groupName) => {
    // 1. Remove from customGroups
    setCustomGroups(prev => prev.filter(g => g !== groupName));

    // 2. Move vessels to default
    const vesselsToUpdate = vessels.filter(v => (v.companyType || "자사간사") === groupName);
    await Promise.all(vesselsToUpdate.map(v => 
      apiFetch(`/vessels/${v.id}`, { method: "PATCH", body: JSON.stringify({ companyType: "자사간사" }) })
    ));

    if (vesselsToUpdate.length > 0) {
      const updatedVesselRes = await apiFetch("/vessels");
      if (updatedVesselRes.ok) {
        setVessels(await updatedVesselRes.json());
      }
    }
  };

  const handleToggleVessel = (id) => {
    setHiddenVessels(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAllVessels = () => {
    const activeVessels = vessels.filter(v => v.active !== false);
    const activeIds = activeVessels.map(v => v.id);
    const allActiveHidden = activeIds.every(id => hiddenVessels.has(id));
    if (allActiveHidden) {
      setHiddenVessels(prev => { const next = new Set(prev); activeIds.forEach(id => next.delete(id)); return next; });
    } else {
      setHiddenVessels(prev => { const next = new Set(prev); activeIds.forEach(id => next.add(id)); return next; });
    }
  };

  const trackHoursRef = useRef(trackHours);
  trackHoursRef.current = trackHours;

  const apiFetch = useMemo(
    () => createApiFetch({ onUnauthorized: handleLogout }),
    [handleLogout]
  );

  const loadPositions = useCallback(
    async (vesselList) => {
      if (vesselList.length === 0) return;
      const results = await Promise.all(
        vesselList.map((v) =>
          apiFetch(`/vessels/${v.id}/positions?hours=${trackHoursRef.current}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((pos) => ({ id: v.id, positions: pos }))
        )
      );
      setPositions((prev) => {
        const next = { ...prev };
        results.forEach(({ id, positions: pos }) => { next[id] = pos; });
        return next;
      });
    },
    [apiFetch]
  );

  useEffect(() => {
    if (!isAuthed) return;
    apiFetch("/vessels")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { const list = Array.isArray(data) ? data : []; setVessels(list); loadPositions(list); })
      .catch(() => { });
  }, [isAuthed, apiFetch]); // eslint-disable-line

  useEffect(() => {
    if (vessels.length === 0) return;
    loadPositions(vessels);
  }, [trackHours]); // eslint-disable-line

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsHost = window.location.protocol === "https:" ? window.location.host : `${window.location.hostname}:3001`;
  const wsToken = getStoredAuthToken();
  const wsUrl = isAuthed ? `${proto}//${wsHost}/ws` : null;

  const dismissToast = useCallback((id) => {
    setZoneToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useWebSocket(wsUrl, (msg) => {
    if (msg.type === "position") {
      const { vesselId } = msg.data;
      setPositions((prev) => ({
        ...prev,
        [vesselId]: [msg.data, ...(prev[vesselId] || [])].slice(0, 2000),
      }));
    } else if (msg.type === "zone_event") {
      const ev = msg.data;
      const toastId = `${ev.vesselId}-${ev.zoneName}-${ev.eventType}-${Date.now()}`;
      setZoneToasts((prev) => [...prev.slice(-4), { id: toastId, ...ev }]);
      // 8초 후 자동 제거
      setTimeout(() => setZoneToasts((prev) => prev.filter((t) => t.id !== toastId)), 8000);
    } else if (msg.type === "vessel_added") {
      const newVessel = msg.data;
      setVessels((prev) => prev.find((v) => v.id === newVessel.id) ? prev : [...prev, newVessel]);
      apiFetch(`/vessels/${newVessel.id}/positions?hours=${trackHoursRef.current}`)
        .then((r) => r.json())
        .then((pos) => setPositions((prev) => ({ ...prev, [newVessel.id]: pos })));
    } else if (msg.type === "vessel_updated") {
      setVessels((prev) => prev.map((v) => (v.id === msg.data.id ? { ...v, ...msg.data } : v)));
    } else if (msg.type === "vessel_removed") {
      setVessels((prev) => prev.filter((v) => v.id !== msg.data.id));
      setPositions((prev) => { const next = { ...prev }; delete next[msg.data.id]; return next; });
      if (selectedVesselId === msg.data.id) setSelectedVesselId(null);
    }
  }, { authToken: wsToken, onUnauthorized: handleLogout });

  useEffect(() => {
    if (!isAuthed) {
      setWsConnected(false);
      return;
    }
    const check = () => {
      apiFetch("/session")
        .then((r) => {
          setWsConnected(r.ok);
          if (r.status === 401) {
            handleLogout();
          }
        })
        .catch(() => setWsConnected(false));
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [isAuthed, apiFetch]);

  // ── 항로 데이터 로딩 ───────────────────────────────────────────────────────
  const fetchLanes = useCallback(async () => {
    try {
      const res = await apiFetch("/lanes");
      if (res.ok) setLanes(await res.json());
    } catch (_) {}
  }, [apiFetch]);

  useEffect(() => {
    if (isAuthed) fetchLanes();
  }, [isAuthed, fetchLanes]);

  // ── ETA 핸들러 ──────────────────────────────────────────────────────────────
  const handleStartEta = useCallback((vesselId) => {
    setEtaVesselId(vesselId);
    setEtaDestination(null);
    setEtaResult(null);
    setEtaMode(true);
    setSelectedVesselId(vesselId);
  }, []);

  const handleDestinationPick = useCallback((dest) => {
    setEtaDestination(dest);
    setEtaMode(false);
  }, []);

  // ETA 계산: EtaPanel 내부에서 수행 (onResultChange 콜백으로 전달받음)

  const handleCloseEta = useCallback(() => {
    setEtaMode(false);
    setEtaVesselId(null);
    setEtaDestination(null);
    setEtaResult(null);
  }, []);

  const handleClearEtaDest = useCallback(() => {
    setEtaDestination(null);
    setEtaResult(null);
    setEtaMode(true);
  }, []);

  const handleAddVessel = async (mmsi, alias, color, companyType) => {
    const res = await apiFetch("/vessels", { method: "POST", body: JSON.stringify({ mmsi, alias, color, companyType }) });
    if (res.ok) {
      const vessel = await res.json();
      setVessels((prev) => (prev.find((v) => v.id === vessel.id) ? prev : [...prev, vessel]));
      setShowAddModal(false);
      return null;
    }
    const err = await res.json();
    return err.error;
  };

  const handleDeleteVessel = async (id) => {
    await apiFetch(`/vessels/${id}`, { method: "DELETE" });
    setVessels((prev) => prev.filter((v) => v.id !== id));
    setPositions((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (selectedVesselId === id) setSelectedVesselId(null);
  };

  const handleArchiveVessel = async (id) => {
    const res = await apiFetch(`/vessels/${id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
    if (res.ok) {
      const updated = await res.json();
      setVessels((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)));
      if (selectedVesselId === id) setSelectedVesselId(null);
    }
  };

  const handleRestoreVessel = async (id) => {
    const res = await apiFetch(`/vessels/${id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
    if (res.ok) {
      const updated = await res.json();
      setVessels((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)));
    }
  };

  const handleUpdateVessel = async (id, updates) => {
    const res = await apiFetch(`/vessels/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
    if (res.ok) {
      const updated = await res.json();
      setVessels((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)));
    }
  };

  const handleManualPosition = async (vesselId, posData) => {
    const res = await apiFetch(`/vessels/${vesselId}/positions`, {
      method: "POST",
      body: JSON.stringify(posData),
    });
    if (res.ok) {
      const pos = await res.json();
      setPositions((prev) => ({
        ...prev,
        [vesselId]: [{ ...pos, vesselId }, ...(prev[vesselId] || [])],
      }));
      setShowManualModal(false);
      return null;
    }
    const err = await res.json();
    return err.error;
  };

  const handleSelectVessel = (id) => {
    setSelectedVesselId(id);
    if (id !== null) setPanTrigger((p) => p + 1);
  };

  const handleSelectPort = (port) => {
    setSelectedPort(port);
    if (port) setPortPanTrigger((p) => p + 1);
  };

  if (!isAuthed) return <LoginPage onLogin={handleLogin} />;

  // Admin 계정 — 항로 관리
  if (accountRole === "admin" && adminView === "lane-manager") {
    return (
      <LaneManager
        apiFetch={apiFetch}
        onClose={() => setAdminView("dashboard")}
        onLaneSaved={() => fetchLanes()}
      />
    );
  }

  // Admin 계정 — 기본은 대시보드, 지도 전환 가능
  if (accountRole === "admin" && adminView === "dashboard") {
    return (
      <AdminDashboard
        apiFetch={apiFetch}
        onLogout={handleLogout}
        onSwitchToMap={() => setAdminView("map")}
        onOpenLaneManager={() => setAdminView("lane-manager")}
      />
    );
  }

  const handleSidebarResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev) => {
      const newWidth = Math.min(500, Math.max(220, startWidth + ev.clientX - startX));
      setSidebarWidth(newWidth);
      localStorage.setItem(acctKey("vessel_sidebar_width"), String(newWidth));
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {sidebarVisible && (
        <>
          <Sidebar
            vessels={vessels}
            positions={positions}
            trackHours={trackHours}
            onTrackHoursChange={setTrackHours}
            onAddVessel={() => setShowAddModal(true)}
            onManualEntry={() => setShowManualModal(true)}
            onManageGroups={() => setShowGroupManageModal(true)}
            onDeleteVessel={handleDeleteVessel}
            onArchiveVessel={handleArchiveVessel}
            onRestoreVessel={handleRestoreVessel}
            onUpdateVessel={handleUpdateVessel}
            onSelectVessel={handleSelectVessel}
            selectedVesselId={selectedVesselId}
            wsConnected={wsConnected}
            apiFetch={apiFetch}
            onShowShare={() => setShowSharePanel(true)}
            onLogout={handleLogout}
            onOpenSettings={() => setShowSettings(true)}
            onOpenGuide={() => setShowGuide(true)}
            hiddenVessels={hiddenVessels}
            onToggleVessel={handleToggleVessel}
            onToggleAllVessels={handleToggleAllVessels}
            showLabels={showLabels}
            onToggleLabels={handleToggleLabels}
            onOpenZoneSettings={() => setShowZoneSettings(true)}
            zoneSettings={zoneSettings}
            onZoneSettingsUpdate={setZoneSettings}
            onFocusArea={handleFocusArea}
            customGroups={customGroups}
            selectedPort={selectedPort}
            onSelectPort={handleSelectPort}
            onStartPlayback={handleStartPlayback}
            onHistoryFetched={handleHistoryFetched}
            onStartEta={handleStartEta}
            sidebarWidth={sidebarWidth}
          />
          {/* 리사이즈 핸들 (데스크탑만) */}
          <div
            className="hidden md:flex w-1.5 cursor-col-resize bg-gray-800 hover:bg-blue-600 transition-colors items-center justify-center flex-shrink-0 print:hidden"
            onMouseDown={handleSidebarResize}
            title="사이드바 너비 조절"
          >
            <div className="w-0.5 h-8 bg-gray-600 rounded" />
          </div>
        </>
      )}

      <div className="flex-1 relative mobile-map-wrapper">
        {/* 사이드바 토글 버튼 */}
        <button
          onClick={() => setSidebarVisible((v) => !v)}
          className="absolute top-3 left-3 z-[900] bg-gray-900/90 hover:bg-gray-800 text-white w-8 h-8 rounded-lg shadow-lg flex items-center justify-center transition print:hidden"
          title={sidebarVisible ? "사이드바 숨기기" : "사이드바 보기"}
        >
          {sidebarVisible ? "◀" : "▶"}
        </button>
        {/* Admin 지도 모드: 대시보드 복귀 버튼 */}
        {accountRole === "admin" && (
          <button
            onClick={() => setAdminView("dashboard")}
            className="absolute top-3 right-3 z-[900] bg-blue-700 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition print:hidden"
          >
            ⬛ 대시보드
          </button>
        )}

        {/* 항로 토글 버튼 */}
        {lanes.length > 0 && (
          <button
            onClick={() => setShowLanes((v) => !v)}
            className={`absolute bottom-8 right-3 z-[900] text-xs px-2.5 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5 transition print:hidden ${
              showLanes
                ? "bg-amber-700/90 hover:bg-amber-600 text-amber-100"
                : "bg-gray-800/90 hover:bg-gray-700 text-gray-400"
            }`}
            title={showLanes ? "항로 숨기기" : "항로 보기"}
          >
            🛣 {showLanes ? "항로 표시 중" : "항로 숨김"}
          </button>
        )}

        {/* ETA 모드 힌트 */}
        {etaMode && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[900]">
            <div className="bg-gray-900/90 text-amber-300 text-sm px-4 py-2 rounded-xl shadow-xl border border-amber-600/50">
              🎯 지도를 클릭하여 목적지를 설정하세요
            </div>
          </div>
        )}

        {/* ETA 패널 — 우상단 고정, 시간이동 버튼과 겹치지 않음 */}
        {etaVesselId && (
          <div
            className="absolute z-[900] print:hidden"
            style={{
              top: accountRole === "admin" ? "3.75rem" : "0.75rem",
              right: "0.75rem",
              maxWidth: 320,
              minWidth: 270,
            }}
          >
            <EtaPanel
              vessel={vessels.find((v) => v.id === etaVesselId)}
              position={positions[etaVesselId]?.[0]}
              lanes={lanes}
              destination={etaDestination}
              onClose={handleCloseEta}
              onClearDest={handleClearEtaDest}
              onResultChange={setEtaResult}
              apiFetch={apiFetch}
              onPortPick={handleDestinationPick}
            />
          </div>
        )}

        <Map
          vessels={
            etaMode
              ? vessels.filter(v => v.active !== false && !hiddenVessels.has(v.id) && v.id === etaVesselId)
              : vessels.filter(v => v.active !== false && !hiddenVessels.has(v.id))
          }
          positions={displayPositions}
          selectedVesselId={selectedVesselId}
          panTrigger={panTrigger}
          onSelectVessel={handleSelectVessel}
          zoneSettings={zoneSettings}
          focusArea={areaFocus}
          trackHours={trackHours}
          selectedPort={selectedPort}
          portPanTrigger={portPanTrigger}
          playbackVesselId={playbackVesselId}
          playback={playback}
          playbackFollow={playbackFollow}
          showLabels={showLabels}
          lanes={lanes}
          showLanes={showLanes}
          etaMode={etaMode}
          onDestinationPick={handleDestinationPick}
          etaResult={etaResult}
          etaDestination={etaDestination}
          etaVesselPos={etaVesselId ? positions[etaVesselId]?.[0] : null}
          onStartEta={handleStartEta}
          onOpenZoneSettings={() => setShowZoneSettings(true)}
        />
        <ReportTable vessels={vessels.filter(v => v.active !== false)} positions={positions} />
        <GlobalTimePanel
          globalTime={globalTime}
          onSetGlobalTime={handleSetGlobalTime}
          positions={positions}
          vessels={vessels.filter(v => v.active !== false)}
        />
        {playbackVesselId && (
          <PlaybackPanel
            vessel={vessels.find((v) => v.id === playbackVesselId)}
            playback={playback}
            follow={playbackFollow}
            onFollowToggle={() => setPlaybackFollow((f) => !f)}
            onClose={handleStopPlayback}
          />
        )}
      </div>

      {showAddModal && (
        <AddVesselModal onAdd={handleAddVessel} onClose={() => setShowAddModal(false)} existingCount={vessels.length} customGroups={[...new Set([...customGroups, ...vessels.map(v => v.companyType).filter(Boolean)])].filter(g => g !== '자사간사' && g !== '타사간사')} apiFetch={apiFetch} />
      )}
      {showSharePanel && (
        <SharePanel
          vessels={vessels}
          apiFetch={apiFetch}
          onClose={() => setShowSharePanel(false)}
        />
      )}
      {showManualModal && (
        <ManualPositionModal vessels={vessels} onSave={handleManualPosition} onClose={() => setShowManualModal(false)} />
      )}
      {showGroupManageModal && (
        <GroupManageModal 
          vessels={vessels} 
          onUpdateVessel={handleUpdateVessel} 
          onClose={() => setShowGroupManageModal(false)}
          customGroups={customGroups}
          onAddGroup={handleAddCustomGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
        />
      )}
      {showZoneSettings && (
        <ZoneSettingsPanel
          zoneSettings={zoneSettings}
          onUpdate={setZoneSettings}
          onFocusArea={(key) => {
            handleFocusArea(key);
            setShowZoneSettings(false);
          }}
          onClose={() => setShowZoneSettings(false)}
        />
      )}
      {showGuide && <UserGuide onClose={() => setShowGuide(false)} />}
      {showSettings && (
        <SettingsModal
          apiFetch={apiFetch}
          accountName={accountName}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
        />
      )}
      <ZoneToast toasts={zoneToasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
