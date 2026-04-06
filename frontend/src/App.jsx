import React, { useState, useEffect, useCallback, useRef } from "react";
import LoginPage from "./components/LoginPage.jsx";
import SharePanel from "./components/SharePanel.jsx";
import Map from "./components/Map/index.jsx";
import Sidebar from "./components/Sidebar/index.jsx";
import AddVesselModal from "./components/AddVesselModal.jsx";
import ManualPositionModal from "./components/ManualPositionModal.jsx";
import GroupManageModal from "./components/GroupManageModal.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import UserGuide from "./components/UserGuide.jsx";
import { useWebSocket } from "./hooks/useWebSocket.js";
import usePlayback from "./hooks/usePlayback.js";
import PlaybackPanel from "./components/PlaybackPanel.jsx";
import ZoneSettingsPanel from "./components/ZoneSettingsPanel.jsx";

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

function App() {
  const [vessels, setVessels] = useState([]);
  const [positions, setPositions] = useState({});
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
    setPlaybackVesselId(vesselId);
    setPlaybackFollow(true);
    setSelectedVesselId(vesselId);
  };

  const handleStopPlayback = () => {
    playback.controls.stop();
    setPlaybackVesselId(null);
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
    const auth = localStorage.getItem("vessel_auth");
    if (auth) {
      const expires = localStorage.getItem("vessel_auth_expires");
      if (expires && Date.now() < parseInt(expires, 10)) {
        return true;
      }
      localStorage.removeItem("vessel_auth");
      localStorage.removeItem("vessel_auth_expires");
      localStorage.removeItem("vessel_account");
      localStorage.removeItem("vessel_role");
    }
    return false;
  });
  const [accountName, setAccountName] = useState(() => localStorage.getItem("vessel_account") || "");
  const [accountRole, setAccountRole] = useState(() => localStorage.getItem("vessel_role") || "user");
  const [adminView, setAdminView] = useState("dashboard"); // admin: "dashboard" | "map"
  const [showSharePanel, setShowSharePanel] = useState(false);

  const handleLogin = (pw, account, role) => {
    localStorage.setItem("vessel_auth", pw);
    localStorage.setItem("vessel_auth_expires", (Date.now() + 86400000).toString());
    localStorage.setItem("vessel_account", account);
    localStorage.setItem("vessel_role", role);
    setAccountName(account);
    setAccountRole(role);
    setIsAuthed(true);
  };
  const handleLogout = () => {
    localStorage.removeItem("vessel_auth");
    localStorage.removeItem("vessel_auth_expires");
    localStorage.removeItem("vessel_account");
    localStorage.removeItem("vessel_role");
    setAccountName("");
    setAccountRole("user");
    setIsAuthed(false);
  };
  const [hiddenVessels, setHiddenVessels] = useState(new Set());
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
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

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

  const apiFetch = useCallback(
    (path, options = {}) => {
      const password = localStorage.getItem("vessel_auth") || "";
      return fetch(`/api${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${password}`,
          ...options.headers,
        },
      });
    },
    []
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
      .then((r) => r.json())
      .then((data) => { setVessels(data); loadPositions(data); })
      .catch(() => { });
  }, [isAuthed, apiFetch]); // eslint-disable-line

  useEffect(() => {
    if (vessels.length === 0) return;
    loadPositions(vessels);
  }, [trackHours]); // eslint-disable-line

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsHost = window.location.protocol === "https:" ? window.location.host : `${window.location.hostname}:3001`;
  const wsToken = localStorage.getItem("vessel_auth") || "";
  const wsUrl = `${proto}//${wsHost}/ws?token=${encodeURIComponent(wsToken)}`;

  useWebSocket(wsUrl, (msg) => {
    if (msg.type === "position") {
      const { vesselId } = msg.data;
      setPositions((prev) => ({
        ...prev,
        [vesselId]: [msg.data, ...(prev[vesselId] || [])].slice(0, 2000),
      }));
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
  });

  useEffect(() => {
    const check = () => {
      apiFetch("/health")
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
  }, [apiFetch]);

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

  // Admin 계정 — 기본은 대시보드, 지도 전환 가능
  if (accountRole === "admin" && adminView === "dashboard") {
    return (
      <AdminDashboard
        apiFetch={apiFetch}
        onLogout={handleLogout}
        onSwitchToMap={() => setAdminView("map")}
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
            onOpenZoneSettings={() => setShowZoneSettings(true)}
            customGroups={customGroups}
            selectedPort={selectedPort}
            onSelectPort={handleSelectPort}
            onStartPlayback={handleStartPlayback}
            onHistoryFetched={handleHistoryFetched}
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
        <Map
          vessels={vessels.filter(v => v.active !== false && !hiddenVessels.has(v.id))}
          positions={positions}
          selectedVesselId={selectedVesselId}
          panTrigger={panTrigger}
          onSelectVessel={handleSelectVessel}
          zoneSettings={zoneSettings}
          trackHours={trackHours}
          selectedPort={selectedPort}
          portPanTrigger={portPanTrigger}
          playbackVesselId={playbackVesselId}
          playback={playback}
          playbackFollow={playbackFollow}
        />
        <ReportTable vessels={vessels.filter(v => v.active !== false)} positions={positions} />
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
        <AddVesselModal onAdd={handleAddVessel} onClose={() => setShowAddModal(false)} existingCount={vessels.length} customGroups={customGroups} apiFetch={apiFetch} />
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
    </div>
  );
}

export default App;
