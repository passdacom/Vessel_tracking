import React, { useState, useEffect, useCallback, useRef } from 'react';
import Map from './components/Map/index.jsx';
import Sidebar from './components/Sidebar/index.jsx';
import AddVesselModal from './components/AddVesselModal.jsx';
import LoginPage from './components/LoginPage.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';

function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('auth_token') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [vessels, setVessels] = useState([]);
  // positions: { [vesselId]: Position[] }  newest-first
  const [positions, setPositions] = useState({});
  const [trackHours, setTrackHours] = useState(24);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVesselId, setSelectedVesselId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);

  const trackHoursRef = useRef(trackHours);
  trackHoursRef.current = trackHours;

  // ── API helper ──────────────────────────────────────────────────────────────
  const apiFetch = useCallback(
    (path, options = {}) =>
      fetch(`/api${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          ...options.headers,
        },
      }),
    [authToken]
  );

  // ── Load positions for a list of vessels ───────────────────────────────────
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
        results.forEach(({ id, positions: pos }) => {
          next[id] = pos;
        });
        return next;
      });
    },
    [apiFetch]
  );

  // ── Auth check on startup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) return;
    apiFetch('/health').then((res) => {
      if (res.ok) {
        setIsLoggedIn(true);
      } else {
        localStorage.removeItem('auth_token');
        setAuthToken('');
      }
    });
  }, []); // eslint-disable-line

  // ── Load vessels when logged in ────────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;
    apiFetch('/vessels')
      .then((r) => r.json())
      .then((data) => {
        setVessels(data);
        loadPositions(data);
      });
  }, [isLoggedIn]); // eslint-disable-line

  // ── Reload positions when trackHours changes ───────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || vessels.length === 0) return;
    loadPositions(vessels);
  }, [trackHours]); // eslint-disable-line

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const wsUrl = isLoggedIn
    ? `ws://${window.location.hostname}:3001/ws?token=${encodeURIComponent(authToken)}`
    : null;

  useWebSocket(wsUrl, (msg) => {
    if (msg.type === 'position') {
      const { vesselId } = msg.data;
      setPositions((prev) => ({
        ...prev,
        [vesselId]: [msg.data, ...(prev[vesselId] || [])].slice(0, 2000),
      }));
    } else if (msg.type === 'vessel_added') {
      const newVessel = msg.data;
      setVessels((prev) =>
        prev.find((v) => v.id === newVessel.id) ? prev : [...prev, newVessel]
      );
      // Load historical positions for the new vessel
      apiFetch(`/vessels/${newVessel.id}/positions?hours=${trackHoursRef.current}`)
        .then((r) => r.json())
        .then((pos) => setPositions((prev) => ({ ...prev, [newVessel.id]: pos })));
    } else if (msg.type === 'vessel_updated') {
      setVessels((prev) =>
        prev.map((v) => (v.id === msg.data.id ? { ...v, ...msg.data } : v))
      );
    } else if (msg.type === 'vessel_removed') {
      setVessels((prev) => prev.filter((v) => v.id !== msg.data.id));
      setPositions((prev) => {
        const next = { ...prev };
        delete next[msg.data.id];
        return next;
      });
      if (selectedVesselId === msg.data.id) setSelectedVesselId(null);
    }
  });

  // Track WS connection status via ping
  useEffect(() => {
    if (!isLoggedIn) return;
    const check = () => {
      apiFetch('/health')
        .then((r) => setWsConnected(r.ok))
        .catch(() => setWsConnected(false));
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [isLoggedIn, apiFetch]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLogin = (password) => {
    setAuthToken(password);
    localStorage.setItem('auth_token', password);
    setIsLoggedIn(true);
  };

  const handleAddVessel = async (mmsi, alias, color) => {
    const res = await apiFetch('/vessels', {
      method: 'POST',
      body: JSON.stringify({ mmsi, alias, color }),
    });
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
    await apiFetch(`/vessels/${id}`, { method: 'DELETE' });
    setVessels((prev) => prev.filter((v) => v.id !== id));
    setPositions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (selectedVesselId === id) setSelectedVesselId(null);
  };

  const handleUpdateVessel = async (id, updates) => {
    const res = await apiFetch(`/vessels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setVessels((prev) => prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)));
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        vessels={vessels}
        positions={positions}
        trackHours={trackHours}
        onTrackHoursChange={setTrackHours}
        onAddVessel={() => setShowAddModal(true)}
        onDeleteVessel={handleDeleteVessel}
        onUpdateVessel={handleUpdateVessel}
        onSelectVessel={setSelectedVesselId}
        selectedVesselId={selectedVesselId}
        wsConnected={wsConnected}
      />

      <div className="flex-1 relative">
        <Map
          vessels={vessels}
          positions={positions}
          selectedVesselId={selectedVesselId}
          onSelectVessel={setSelectedVesselId}
        />
      </div>

      {showAddModal && (
        <AddVesselModal
          onAdd={handleAddVessel}
          onClose={() => setShowAddModal(false)}
          existingCount={vessels.length}
        />
      )}
    </div>
  );
}

export default App;
