import React, { useState, useEffect } from "react";

export default function SharePanel({ vessels, apiFetch, onClose }) {
  const [shares, setShares] = useState([]);
  const [label, setLabel] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = () =>
    apiFetch("/shares").then(r => r.json()).then(setShares).catch(() => {});

  useEffect(() => { load(); }, []);

  const toggleVessel = (id) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const createShare = async () => {
    if (!label || !selectedIds.length) return;
    setCreating(true);
    await apiFetch("/shares", {
      method: "POST",
      body: JSON.stringify({ label, vesselIds: selectedIds }),
    });
    setLabel("");
    setSelectedIds([]);
    setCreating(false);
    load();
  };

  const deleteShare = async (token) => {
    await apiFetch(`/shares/${token}`, { method: "DELETE" });
    load();
  };

  const copyUrl = (token) => {
    const url = `${window.location.origin}/view/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const getShareUrl = (token) => `${window.location.origin}/view/${token}`;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:2000,
      background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center"
    }} onClick={onClose}>
      <div style={{
        background:"#1e293b", borderRadius:16, width:480, maxHeight:"80vh",
        border:"1px solid #334155", boxShadow:"0 25px 60px rgba(0,0,0,0.6)",
        overflow:"hidden", display:"flex", flexDirection:"column"
      }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #334155", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:16 }}>🔗 공유 링크 관리</div>
            <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>선박 선택 후 고유 링크를 생성합니다</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:20 }}>
          {/* 새 링크 생성 */}
          <div style={{ background:"#0f172a", borderRadius:10, padding:16, marginBottom:20, border:"1px solid #1e3a5f" }}>
            <div style={{ color:"#93c5fd", fontSize:12, fontWeight:700, marginBottom:12 }}>새 공유 링크 생성</div>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="링크 이름 (예: Client A)"
              style={{
                width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid #334155",
                background:"#1e293b", color:"#f1f5f9", fontSize:13, marginBottom:12, boxSizing:"border-box"
              }}
            />
            <div style={{ marginBottom:12 }}>
              <div style={{ color:"#64748b", fontSize:11, marginBottom:8 }}>표시할 선박 선택:</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {vessels.map(v => (
                  <label key={v.id} style={{
                    display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                    padding:"6px 10px", borderRadius:6,
                    background: selectedIds.includes(v.id) ? "#1e3a5f" : "transparent",
                    border: `1px solid ${selectedIds.includes(v.id) ? "#3b82f6" : "#334155"}`,
                    transition:"all 0.15s"
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(v.id)}
                      onChange={() => toggleVessel(v.id)}
                      style={{ accentColor: v.color }}
                    />
                    <div style={{ width:10, height:10, borderRadius:"50%", backgroundColor:v.color }} />
                    <span style={{ color:"#e2e8f0", fontSize:13 }}>{v.alias || v.name || v.mmsi}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={createShare}
              disabled={creating || !label || !selectedIds.length}
              style={{
                width:"100%", padding:"8px 16px", borderRadius:8, border:"none",
                background: (creating || !label || !selectedIds.length) ? "#334155" : "#2563eb",
                color: (creating || !label || !selectedIds.length) ? "#64748b" : "#fff",
                fontWeight:700, fontSize:13, cursor: "pointer", transition:"all 0.15s"
              }}
            >
              {creating ? "생성 중..." : "🔗 링크 생성"}
            </button>
          </div>

          {/* 기존 링크 목록 */}
          {shares.length > 0 && (
            <div>
              <div style={{ color:"#64748b", fontSize:11, fontWeight:700, marginBottom:10 }}>생성된 링크 ({shares.length}개)</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {shares.map(s => (
                  <div key={s.token} style={{
                    background:"#0f172a", borderRadius:10, padding:14,
                    border:"1px solid #1e293b"
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <div>
                        <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:13 }}>{s.label}</div>
                        <div style={{ color:"#64748b", fontSize:11, marginTop:2 }}>
                          {s.vesselIds.length}척 · {new Date(s.createdAt).toLocaleDateString("ko-KR")}
                        </div>
                      </div>
                      <button onClick={() => deleteShare(s.token)} style={{
                        background:"#450a0a", border:"1px solid #7f1d1d", color:"#fca5a5",
                        borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer"
                      }}>삭제</button>
                    </div>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <div style={{
                        flex:1, background:"#1e293b", borderRadius:6, padding:"6px 10px",
                        color:"#64748b", fontSize:11, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"
                      }}>
                        {getShareUrl(s.token)}
                      </div>
                      <button onClick={() => copyUrl(s.token)} style={{
                        background: copied === s.token ? "#14532d" : "#1e3a5f",
                        border:`1px solid ${copied === s.token ? "#166534" : "#1d4ed8"}`,
                        color: copied === s.token ? "#4ade80" : "#93c5fd",
                        borderRadius:6, padding:"6px 10px", fontSize:11, cursor:"pointer", whiteSpace:"nowrap"
                      }}>
                        {copied === s.token ? "✓ 복사됨" : "📋 복사"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {shares.length === 0 && (
            <div style={{ textAlign:"center", color:"#475569", fontSize:13, paddingTop:16 }}>
              생성된 공유 링크가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
