import React, { useState, useEffect, useCallback, useRef } from "react";
import LoginPage from "./components/LoginPage.jsx";
import SharePanel from "./components/SharePanel.jsx";
import Map from "./components/Map/index.jsx";
import Sidebar from "./components/Sidebar/index.jsx";
import AddVesselModal from "./components/AddVesselModal.jsx";
import ManualPositionModal from "./components/ManualPositionModal.jsx";
import { useWebSocket } from "./hooks/useWebSocket.js";

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
  const [selectedVesselId, setSelectedVesselId] = useState(null);
  const [panTrigger, setPanTrigger] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [isAuthed, setIsAuthed] = useState(() => localStorage.getItem("vessel_auth") === "kb1234");
  const [showSharePanel, setShowSharePanel] = useState(false);

  const handleLogin = (pw) => {
    localStorage.setItem("vessel_auth", pw);
    setIsAuthed(true);
  };
  const handleLogout = () => {
    localStorage.removeItem("vessel_auth");
    setIsAuthed(false);
  };
  const [hiddenVessels, setHiddenVessels] = useState(new Set());
  const [showRestrictedZone, setShowRestrictedZone] = useState(true);

  const handleToggleVessel = (id) => {
    setHiddenVessels(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleAllVessels = () => {
    if (hiddenVessels.size === vessels.length) {
      // 모두 숨겨져 있으면 -> 모두 표시
      setHiddenVessels(new Set());
    } else {
      // 하나라도 보이면 -> 전체 숨기기
      setHiddenVessels(new Set(vessels.map(v => v.id)));
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
  const wsUrl = `${proto}//${wsHost}/ws`;

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

  const handleAddVessel = async (mmsi, alias, color) => {
    const res = await apiFetch("/vessels", { method: "POST", body: JSON.stringify({ mmsi, alias, color }) });
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
    if (selectedVesselId === id && id !== null) {
      setPanTrigger((p) => p + 1);
    } else {
      setSelectedVesselId(id);
    }
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
        onDeleteVessel={handleDeleteVessel}
        onUpdateVessel={handleUpdateVessel}
        onSelectVessel={handleSelectVessel}
        selectedVesselId={selectedVesselId}
        wsConnected={wsConnected}
        onShowShare={() => setShowSharePanel(true)}
        onLogout={handleLogout}
        hiddenVessels={hiddenVessels}
        onToggleVessel={handleToggleVessel}
        onToggleAllVessels={handleToggleAllVessels}
        showRestrictedZone={showRestrictedZone}
        onToggleZone={handleToggleZone}
      />

      <div className="flex-1 relative mobile-map-wrapper">
        <Map
          vessels={vessels.filter(v => !hiddenVessels.has(v.id))}
          positions={positions}
          selectedVesselId={selectedVesselId}
          panTrigger={panTrigger}
          onSelectVessel={handleSelectVessel}
          showRestrictedZone={showRestrictedZone}
          trackHours={trackHours}
        />
        <ReportTable vessels={vessels} positions={positions} />
      </div>

      {showAddModal && (
        <AddVesselModal onAdd={handleAddVessel} onClose={() => setShowAddModal(false)} existingCount={vessels.length} />
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
    </div>
  );
}

export default App;
