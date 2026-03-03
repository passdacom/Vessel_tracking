import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import VesselMarker from "./Map/VesselMarker.jsx";
import VesselTrack from "./Map/VesselTrack.jsx";
import RestrictedZone from "./Map/RestrictedZone.jsx";

export default function SharedView({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showZone, setShowZone] = useState(true);

  useEffect(() => {
    fetch(`/api/shares/view/${token}?hours=72`)
      .then((r) => {
        if (!r.ok) throw new Error("Invalid or expired link");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0f172a", color:"#ef4444", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:48 }}>⚓</div>
      <div style={{ fontSize:18, fontWeight:700 }}>접근 불가</div>
      <div style={{ color:"#94a3b8", fontSize:14 }}>{error}</div>
    </div>
  );

  if (!data) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0f172a", color:"#94a3b8", gap:12 }}>
      <div style={{ fontSize:14 }}>로딩 중...</div>
    </div>
  );

  // positions map
  const positions = {};
  data.vessels.forEach(v => { positions[v.id] = v.positions; });

  return (
    <div style={{ width:"100vw", height:"100vh", position:"relative" }}>
      {/* 상단 배너 */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, zIndex:1100,
        background:"rgba(15,23,42,0.92)", backdropFilter:"blur(8px)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"10px 16px", borderBottom:"1px solid #1e293b"
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>⚓</span>
          <div>
            <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{data.label}</div>
            <div style={{ color:"#64748b", fontSize:11 }}>{data.vessels.length}척 모니터링 중</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button onClick={() => setShowZone(v => !v)} style={{
            padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:11, fontWeight:600,
            background: showZone ? "#7f1d1d" : "#334155", color: showZone ? "#fca5a5" : "#94a3b8"
          }}>
            {showZone ? "🔴 Zone ON" : "⬜ Zone OFF"}
          </button>
          <div style={{ color:"#475569", fontSize:11 }}>Read Only</div>
        </div>
      </div>

      {/* 지도 */}
      <MapContainer center={[25.5, 54]} zoom={6} style={{ width:"100%", height:"100%" }} zoomControl={true}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CartoDB"
          maxZoom={18}
        />
        <RestrictedZone visible={showZone} />
        {data.vessels.map(vessel => (
          <React.Fragment key={vessel.id}>
            <VesselMarker
              vessel={vessel}
              position={positions[vessel.id]?.[0]}
              isSelected={selectedId === vessel.id}
              onSelect={() => setSelectedId(id => id === vessel.id ? null : vessel.id)}
            />
            {selectedId === vessel.id && positions[vessel.id]?.length > 1 && (
              <VesselTrack positions={positions[vessel.id]} color={vessel.color} />
            )}
          </React.Fragment>
        ))}
      </MapContainer>

      {/* 선박 범례 */}
      <div style={{
        position:"absolute", bottom:16, left:16, zIndex:1000,
        background:"rgba(15,23,42,0.9)", backdropFilter:"blur(8px)",
        borderRadius:10, padding:"10px 14px", border:"1px solid #1e293b",
        minWidth:180
      }}>
        <div style={{ color:"#64748b", fontSize:10, fontWeight:700, marginBottom:8, letterSpacing:"0.05em" }}>VESSELS</div>
        {data.vessels.map(v => {
          const pos = positions[v.id]?.[0];
          const stale = !pos || Date.now() - new Date(pos.timestamp) > 2*60*60*1000;
          return (
            <div key={v.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, cursor:"pointer" }}
              onClick={() => setSelectedId(id => id === v.id ? null : v.id)}>
              <div style={{ width:10, height:10, borderRadius:"50%", backgroundColor:v.color, flexShrink:0 }} />
              <div>
                <div style={{ color:"#e2e8f0", fontSize:12, fontWeight:600 }}>{v.alias || v.name || v.mmsi}</div>
                <div style={{ color: stale ? "#ef4444" : "#4ade80", fontSize:10 }}>
                  {pos ? `${pos.sog?.toFixed(1) ?? "-"} kn · ${stale ? "Stale" : "Active"}` : "No data"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
