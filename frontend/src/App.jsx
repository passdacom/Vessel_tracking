import React, { useState, useEffect, useCallback, useRef } from "react";
import LoginPage from "./components/LoginPage.jsx";
import SharePanel from "./components/SharePanel.jsx";
import Map from "./components/Map/index.jsx";
import Sidebar from "./components/Sidebar/index.jsx";
import AddVesselModal from "./components/AddVesselModal.jsx";
import ManualPositionModal from "./components/ManualPositionModal.jsx";
import GroupManageModal from "./components/GroupManageModal.jsx";
import { useWebSocket } from "./hooks/useWebSocket.js";
import usePlayback from "./hooks/usePlayback.js";
import PlaybackPanel from "./components/PlaybackPanel.jsx";

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
      // 만료됐으면 삭제
      localStorage.removeItem("vessel_auth");
      localStorage.removeItem("vessel_auth_expires");
    }
    return false;
  });
  const [showSharePanel, setShowSharePanel] = useState(false);

  const handleLogin = (pw) => {
    localStorage.setItem("vessel_auth", pw);
    // 24 hours in milliseconds: 24 * 60 * 60 * 1000 = 86400000
    localStorage.setItem("vessel_auth_expires", (Date.now() + 86400000).toString());
    setIsAuthed(true);
  };
  const handleLogout = () => {
    localStorage.removeItem("vessel_auth");
    localStorage.removeItem("vessel_auth_expires");
    setIsAuthed(false);
  };
  const [hiddenVessels, setHiddenVessels] = useState(new Set());
  const [showRestrictedZone, setShowRestrictedZone] = useState(true);
  const [zoneOpacity, setZoneOpacity] = useState(0.15); // New state for HRA opacity
  const [selectedRegions, setSelectedRegions] = useState([]); // New state for per-region opacity

  // New state for custom groups
  const [customGroups, setCustomGroups] = useState(() => {
    try {
      const stored = localStorage.getItem("vessel_custom_groups");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Persist custom groups
  useEffect(() => {
    localStorage.setItem("vessel_custom_groups", JSON.stringify(customGroups));
  }, [customGroups]);

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

  const handleToggleRegion = (regionName) => {
    setSelectedRegions((prev) => {
      if (prev.includes(regionName)) {
        return prev.filter((r) => r !== regionName);
      } else {
        return [...prev, regionName];
      }
    });
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

  const handleToggleZone = () => setShowRestrictedZone(v => !v);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden">
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
        hiddenVessels={hiddenVessels}
        onToggleVessel={handleToggleVessel}
        onToggleAllVessels={handleToggleAllVessels}
        showRestrictedZone={showRestrictedZone}
        onToggleZone={handleToggleZone}
        zoneOpacity={zoneOpacity}
        onZoneOpacityChange={setZoneOpacity}
        selectedRegions={selectedRegions}
        onClearSelectedRegions={() => setSelectedRegions([])}
        customGroups={customGroups}
        selectedPort={selectedPort}
        onSelectPort={handleSelectPort}
        onStartPlayback={handleStartPlayback}
        onHistoryFetched={handleHistoryFetched}
      />

      <div className="flex-1 relative mobile-map-wrapper">
        <Map
          vessels={vessels.filter(v => v.active !== false && !hiddenVessels.has(v.id))}
          positions={positions}
          selectedVesselId={selectedVesselId}
          panTrigger={panTrigger}
          onSelectVessel={handleSelectVessel}
          showRestrictedZone={showRestrictedZone}
          zoneOpacity={zoneOpacity}
          selectedRegions={selectedRegions}
          toggleSelectedRegion={handleToggleRegion}
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
        <AddVesselModal onAdd={handleAddVessel} onClose={() => setShowAddModal(false)} existingCount={vessels.length} customGroups={customGroups} />
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
    </div>
  );
}

export default App;
