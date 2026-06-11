import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, useMapEvents, useMap, Tooltip } from "react-leaflet";
import L from "leaflet";
import * as turf from "@turf/turf";

// ── 좌표 변환 헬퍼 ────────────────────────────────────────────────────────────
// DB/GeoJSON: [lon, lat]  ↔  Leaflet: [lat, lon]
const toLeaflet = (lonLats) => lonLats.map(([lon, lat]) => [lat, lon]);
const toGeoJSON = (latLons) => latLons.map(([lat, lon]) => [lon, lat]);

// ── 색상 sanitization (XSS 방지) ─────────────────────────────────────────────
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function safeColor(val, fallback = "#f59e0b") {
  return HEX_COLOR_RE.test(val) ? val : fallback;
}

// ── 초기 지도 위치: 항로 범위에 맞게 fitBounds ────────────────────────────────
function FitBoundsOnLoad({ waypoints }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || waypoints.length < 2) return;
    try {
      const bounds = L.latLngBounds(waypoints.map(([lat, lon]) => [lat, lon]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
      fitted.current = true;
    } catch (_) {}
  }, [map, waypoints]);
  return null;
}

// ── 지도 중심 추적 (즐겨찾기용) ──────────────────────────────────────────────
function MapCenterTracker({ centerRef }) {
  const map = useMap();
  useEffect(() => {
    const update = () => { centerRef.current = map.getCenter(); };
    update();
    map.on("move", update);
    return () => map.off("move", update);
  }, [map, centerRef]);
  return null;
}

// ── 드래그 가능한 웨이포인트 아이콘 ──────────────────────────────────────────
function makeWpIcon(color, mode) {
  const isDelete = mode === "delete";
  const bg = isDelete ? "#ef4444" : safeColor(color);
  const cursor = isDelete ? "pointer" : mode === "move" ? "grab" : "default";
  return L.divIcon({
    html: `<div style="
      width:12px;height:12px;border-radius:50%;
      background:${bg};border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
      cursor:${cursor};
    "></div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// ── 지도 클릭 핸들러 ─────────────────────────────────────────────────────────
function MapClickHandler({ mode, onAdd }) {
  useMapEvents({
    click(e) {
      if (mode !== "add") return;
      onAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// ── 적응형 단순화: tolerance를 올려가며 20~30포인트 목표 ─────────────────────
function simplifyAdaptive(lonLatCoords) {
  if (lonLatCoords.length <= 30) return lonLatCoords;
  const line = turf.lineString(lonLatCoords);
  let tolerance = 0.02;
  let simplified;
  let iterations = 0;
  do {
    simplified = turf.simplify(line, { tolerance, highQuality: true });
    tolerance *= 1.5;
    iterations++;
  } while (simplified.geometry.coordinates.length > 30 && tolerance < 10 && iterations < 20);
  const coords = simplified.geometry.coordinates;
  if (coords.length < 2) {
    const step = Math.max(1, Math.floor(lonLatCoords.length / 20));
    return lonLatCoords.filter((_, i) => i % step === 0 || i === lonLatCoords.length - 1);
  }
  return coords;
}

// ── 즐겨찾기 로컬스토리지 헬퍼 ──────────────────────────────────────────────
const FAV_KEY = "lane_wp_favorites";
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); }
  catch { return []; }
}
function saveFavoritesToStorage(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

// ── 참조 항적 색상 팔레트 ────────────────────────────────────────────────────
const REF_COLORS = ["#60a5fa","#34d399","#f472b6","#fb923c","#a78bfa","#facc15","#38bdf8","#4ade80"];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function LaneEditor({ apiFetch, initialLane, onSave, onCancel }) {
  // 편집 상태
  const [mode, setMode] = useState("add");
  const [waypoints, setWaypoints] = useState(() =>
    initialLane?.coordinates ? toLeaflet(initialLane.coordinates) : []
  );
  const [name, setName] = useState(initialLane?.name || "");
  const [description, setDescription] = useState(initialLane?.description || "");
  const [color, setColor] = useState(initialLane?.color || "#f59e0b");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // undo 스택 — setUndoStack 직접 사용 (pushUndo는 setUndoStack 래퍼)
  const [undoStack, setUndoStack] = useState([]);
  const pushUndo = useCallback((prev) => {
    setUndoStack(s => [...s.slice(-19), prev]);
  }, []);
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setWaypoints(prev);
    setUndoStack(s => s.slice(0, -1));
  };

  // ── 드래그 수정: ref로 pre-drag 상태 캡처 (setState 없음 → 재렌더 없음) ────
  const waypointsRef = useRef(waypoints);
  useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);
  const preDragRef = useRef(null);

  const handleDragStart = useCallback(() => {
    preDragRef.current = waypointsRef.current;
  }, []);

  const handleDragEnd = useCallback((idx, e) => {
    const { lat, lng } = e.target.getLatLng();
    if (preDragRef.current !== null) {
      setUndoStack(s => [...s.slice(-19), preDragRef.current]);
      preDragRef.current = null;
    }
    setWaypoints(prev => {
      const next = [...prev];
      next[idx] = [lat, lng];
      return next;
    });
  }, []);

  // ── 선박 목록 ─────────────────────────────────────────────────────────────
  const [vessels, setVessels] = useState([]);
  useEffect(() => {
    apiFetch("/admin/vessels")
      .then(r => r.ok ? r.json() : [])
      .then(vs => {
        const seen = new Set();
        setVessels(vs.filter(v => { if (seen.has(v.mmsi)) return false; seen.add(v.mmsi); return true; }));
      })
      .catch(() => {});
  }, [apiFetch]);

  // ── 참조 항적 (다중 선박) ─────────────────────────────────────────────────
  // refTracks: { [vesselId]: { name, positions: [[lat,lon],...], color, visible } }
  const [refTracks, setRefTracks] = useState({});
  const [refLoading, setRefLoading] = useState(false);
  const [refSelectId, setRefSelectId] = useState("");
  const [showRefPanel, setShowRefPanel] = useState(false);

  const handleAddRefTrack = useCallback(async (vesselId) => {
    if (!vesselId || refTracks[vesselId]) return;
    setRefLoading(true);
    try {
      const res = await apiFetch(`/vessels/${vesselId}/positions?hours=2160`);
      if (!res.ok) throw new Error("항적 데이터를 불러오지 못했습니다");
      const positions = await res.json();
      if (positions.length < 2) { setError("항적 데이터가 부족합니다"); return; }
      const sorted = [...positions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const vessel = vessels.find(v => String(v.id) === String(vesselId));
      const colorIdx = Object.keys(refTracks).length % REF_COLORS.length;
      setRefTracks(prev => ({
        ...prev,
        [vesselId]: {
          name: vessel?.alias || vessel?.name || vessel?.mmsi || vesselId,
          positions: sorted.map(p => [p.lat, p.lon]),
          color: REF_COLORS[colorIdx],
          visible: true,
        },
      }));
    } catch (e) { setError(e.message); }
    setRefLoading(false);
  }, [apiFetch, vessels, refTracks]);

  const handleShowAllTracks = useCallback(async () => {
    if (vessels.length === 0) return;
    if (!window.confirm(`${vessels.length}개 선박의 항적을 모두 불러옵니다. 시간이 걸릴 수 있습니다. 계속하시겠습니까?`)) return;
    setRefLoading(true);
    const newTracks = {};
    for (let i = 0; i < vessels.length; i++) {
      const vessel = vessels[i];
      if (refTracks[vessel.id]) continue;
      try {
        const res = await apiFetch(`/vessels/${vessel.id}/positions?hours=2160`);
        if (!res.ok) continue;
        const positions = await res.json();
        if (positions.length < 2) continue;
        const sorted = [...positions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const colorIdx = (Object.keys(refTracks).length + Object.keys(newTracks).length) % REF_COLORS.length;
        newTracks[vessel.id] = {
          name: vessel.alias || vessel.name || vessel.mmsi,
          positions: sorted.map(p => [p.lat, p.lon]),
          color: REF_COLORS[colorIdx],
          visible: true,
        };
      } catch (_) {}
    }
    setRefTracks(prev => ({ ...prev, ...newTracks }));
    setRefLoading(false);
  }, [apiFetch, vessels, refTracks]);

  const toggleRefVisible = (id) => {
    setRefTracks(prev => ({ ...prev, [id]: { ...prev[id], visible: !prev[id].visible } }));
  };
  const removeRefTrack = (id) => {
    setRefTracks(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // ── 항적에서 웨이포인트 생성 (기존 기능) ─────────────────────────────────
  const [importId, setImportId] = useState("");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!importId) return;
    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch(`/vessels/${importId}/positions?hours=2160`);
      if (!res.ok) throw new Error("항적 데이터를 불러오지 못했습니다");
      const positions = await res.json();
      if (positions.length < 2) { setError("항적 데이터가 부족합니다 (최소 2개 포인트 필요)"); return; }
      const sorted = [...positions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const lonLats = sorted.map(p => [p.lon, p.lat]);
      const simplified = simplifyAdaptive(lonLats);
      pushUndo(waypoints);
      setWaypoints(toLeaflet(simplified));
      // 참조 항적에도 추가
      const vessel = vessels.find(v => String(v.id) === String(importId));
      const colorIdx = Object.keys(refTracks).length % REF_COLORS.length;
      setRefTracks(prev => ({
        ...prev,
        [importId]: {
          name: vessel?.alias || vessel?.name || vessel?.mmsi || importId,
          positions: sorted.map(p => [p.lat, p.lon]),
          color: REF_COLORS[colorIdx],
          visible: true,
        },
      }));
    } catch (e) { setError(e.message || "항적 가져오기 실패"); }
    finally { setImporting(false); }
  };

  // ── 웨이포인트 추가/삭제 ──────────────────────────────────────────────────
  const handleAdd = useCallback((latLon) => {
    setWaypoints(prev => {
      pushUndo(prev);
      return [...prev, latLon];
    });
  }, [pushUndo]);

  const handleDelete = useCallback((idx) => {
    setWaypoints(prev => {
      pushUndo(prev);
      return prev.filter((_, i) => i !== idx);
    });
  }, [pushUndo]);

  // GeoJSON 캐싱
  const waypointsGeoJSON = useMemo(() => toGeoJSON(waypoints), [waypoints]);

  // ── 선분 클릭 → 중간 삽입 (add 모드) ────────────────────────────────────
  const handleLineClick = useCallback((e) => {
    if (mode !== "add" || waypoints.length < 2) return;
    e.originalEvent?.stopPropagation();
    const clickPt = turf.point([e.latlng.lng, e.latlng.lat]);
    const line = turf.lineString(waypointsGeoJSON);
    const nearest = turf.nearestPointOnLine(line, clickPt);
    const insertAfter = nearest.properties.index ?? 0;
    setWaypoints(prev => {
      pushUndo(prev);
      return [
        ...prev.slice(0, insertAfter + 1),
        [e.latlng.lat, e.latlng.lng],
        ...prev.slice(insertAfter + 1),
      ];
    });
  }, [mode, waypoints.length, waypointsGeoJSON, pushUndo]);

  // ── 웨이포인트 삽입 메뉴 (앞/뒤 추가) ───────────────────────────────────
  const [wpMenu, setWpMenu] = useState(null); // { idx, lat, lon }

  const handleInsertBefore = useCallback((idx) => {
    setWaypoints(prev => {
      pushUndo(prev);
      const cur = prev[idx];
      const before = idx > 0 ? prev[idx - 1] : null;
      const newWp = before
        ? [(cur[0] + before[0]) / 2, (cur[1] + before[1]) / 2]
        : [cur[0] + 0.3, cur[1] - 0.3];
      return [...prev.slice(0, idx), newWp, ...prev.slice(idx)];
    });
    setWpMenu(null);
    setMode("move");
  }, [pushUndo]);

  const handleInsertAfter = useCallback((idx) => {
    setWaypoints(prev => {
      pushUndo(prev);
      const cur = prev[idx];
      const next = idx < prev.length - 1 ? prev[idx + 1] : null;
      const newWp = next
        ? [(cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2]
        : [cur[0] - 0.3, cur[1] + 0.3];
      return [...prev.slice(0, idx + 1), newWp, ...prev.slice(idx + 1)];
    });
    setWpMenu(null);
    setMode("move");
  }, [pushUndo]);

  // ── 전체 초기화 ───────────────────────────────────────────────────────────
  const handleClear = () => {
    if (waypoints.length === 0) return;
    if (!window.confirm("모든 웨이포인트를 삭제하시겠습니까?")) return;
    pushUndo(waypoints);
    setWaypoints([]);
    setWpMenu(null);
  };

  // ── 즐겨찾기 ─────────────────────────────────────────────────────────────
  const [favorites, setFavorites] = useState(loadFavorites);
  const [showFavPanel, setShowFavPanel] = useState(false);
  const mapCenterRef = useRef({ lat: 25.0, lng: 68.0 });

  const addFavorite = (lat, lon, name) => {
    const fav = { id: Date.now().toString(), name, lat, lon };
    setFavorites(prev => {
      const next = [...prev, fav];
      saveFavoritesToStorage(next);
      return next;
    });
  };

  const removeFavorite = (id) => {
    setFavorites(prev => {
      const next = prev.filter(f => f.id !== id);
      saveFavoritesToStorage(next);
      return next;
    });
  };

  const insertFavorite = (fav) => {
    setWaypoints(prev => {
      pushUndo(prev);
      return [...prev, [fav.lat, fav.lon]];
    });
  };

  const handleSaveFavFromMenu = () => {
    if (!wpMenu) return;
    const name = window.prompt("즐겨찾기 이름:", `웨이포인트 ${wpMenu.idx + 1}`);
    if (name?.trim()) {
      addFavorite(wpMenu.lat, wpMenu.lon, name.trim());
      setWpMenu(null);
    }
  };

  const handleSaveFavFromCenter = () => {
    const name = window.prompt("즐겨찾기 이름 (현재 지도 중심):");
    if (name?.trim()) {
      addFavorite(mapCenterRef.current.lat, mapCenterRef.current.lng, name.trim());
    }
  };

  // ── 저장 ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setError("항로명을 입력해주세요"); return; }
    if (waypoints.length < 2) { setError("웨이포인트가 2개 이상이어야 합니다"); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        coordinates: toGeoJSON(waypoints),
        color,
      };
      const res = await apiFetch(
        initialLane ? `/lanes/${initialLane.id}` : "/lanes",
        { method: initialLane ? "PUT" : "POST", body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장 실패");
      }
      const saved = await res.json();
      onSave(saved);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const refTrackCount = Object.keys(refTracks).length;
  const moveWpIcon = useMemo(() => makeWpIcon(color, "move"), [color]);

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-950" style={{ zIndex: 500 }}>

      {/* ① 상단 컨트롤 바 */}
      <div className="bg-gray-900 border-b border-gray-800 px-3 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition mr-1"
          title="목록으로 돌아가기"
        >
          ← 목록
        </button>

        <div className="w-px h-5 bg-gray-700" />

        {/* 편집 모드 */}
        <div className="flex gap-1">
          {[
            { key: "add",    label: "+ 추가",  title: "빈 곳 클릭 → 끝에 추가 / 선분 클릭 → 중간 삽입" },
            { key: "select", label: "☰ 선택",  title: "웨이포인트 클릭 → 앞에 추가 / 뒤에 추가 / 즐겨찾기 저장" },
            { key: "move",   label: "↔ 이동",  title: "마커를 드래그하여 이동" },
            { key: "delete", label: "✕ 삭제",  title: "마커 클릭으로 삭제" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => { setMode(m.key); setWpMenu(null); }}
              title={m.title}
              className={`px-2.5 py-1 text-xs rounded border transition font-medium ${
                mode === m.key
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-700" />

        {/* undo / 초기화 */}
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 transition"
          title={`실행 취소 (${undoStack.length}단계 가능)`}
        >
          ↩ 실행취소
        </button>
        <button
          onClick={handleClear}
          disabled={waypoints.length === 0}
          className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed text-gray-400 hover:text-red-300 transition"
        >
          초기화
        </button>

        <div className="w-px h-5 bg-gray-700" />

        {/* 참조 항적 토글 */}
        <button
          onClick={() => setShowRefPanel(v => !v)}
          className={`px-2.5 py-1 text-xs rounded border transition flex items-center gap-1 ${
            showRefPanel
              ? "bg-indigo-700 border-indigo-600 text-white"
              : "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
          }`}
          title="참조용 항적 표시/숨기기"
        >
          📡 참조 항적{refTrackCount > 0 ? ` (${refTrackCount})` : ""}
        </button>

        {/* 즐겨찾기 토글 */}
        <button
          onClick={() => setShowFavPanel(v => !v)}
          className={`px-2.5 py-1 text-xs rounded border transition flex items-center gap-1 ${
            showFavPanel
              ? "bg-amber-700 border-amber-600 text-white"
              : "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
          }`}
          title="즐겨찾기 웨이포인트"
        >
          ★ 즐겨찾기{favorites.length > 0 ? ` (${favorites.length})` : ""}
        </button>

        <div className="w-px h-5 bg-gray-700" />

        {/* 색상 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">색상</span>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
          />
        </div>

        {/* 항로명 */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="항로명 (필수)"
          className="flex-1 min-w-[140px] bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1 focus:outline-none focus:border-blue-500"
        />

        {/* 설명 */}
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          className="w-40 bg-gray-800 border border-gray-600 text-white text-sm rounded px-2.5 py-1 focus:outline-none focus:border-blue-500"
        />

        <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">{waypoints.length}pts</span>

        {/* 저장 */}
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={handleSave}
            disabled={saving || waypoints.length < 2 || !name.trim()}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition font-medium"
          >
            {saving ? "저장 중..." : initialLane ? "수정 저장" : "항로 저장"}
          </button>
        </div>
      </div>

      {/* ② 항적 가져오기 바 */}
      <div className="bg-gray-800 border-b border-gray-700 px-3 py-1.5 flex items-center gap-2 flex-shrink-0 flex-wrap">
        <span className="text-xs text-gray-400 flex-shrink-0">항적에서 웨이포인트 생성:</span>
        <select
          value={importId}
          onChange={e => setImportId(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white text-xs rounded px-2 py-1 flex-shrink-0 focus:outline-none"
          style={{ minWidth: 160 }}
        >
          <option value="">선박 선택...</option>
          {vessels.map(v => (
            <option key={v.id} value={v.id}>
              {v.alias || v.name || v.mmsi}
            </option>
          ))}
        </select>
        <button
          onClick={handleImport}
          disabled={!importId || importing}
          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white text-xs rounded transition flex-shrink-0"
        >
          {importing ? "처리 중..." : "웨이포인트로 변환"}
        </button>

        <span className="text-xs text-gray-600 ml-auto hidden sm:block">
          {mode === "add"
            ? "빈 곳·선분 클릭 → 포인트 추가"
            : mode === "select"
            ? "웨이포인트 클릭 → 앞/뒤 추가 또는 즐겨찾기"
            : mode === "move"
            ? "마커를 드래그하여 이동"
            : "마커 클릭 → 삭제"}
        </span>
      </div>

      {/* ③ 에러 배너 */}
      {error && (
        <div className="bg-red-900 border-b border-red-700 px-3 py-1.5 text-sm text-red-200 flex items-center gap-2 flex-shrink-0">
          <span>⚠</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
        </div>
      )}

      {/* ④ 지도 + 사이드 패널 */}
      <div className="flex-1 flex overflow-hidden">

        {/* 참조 항적 패널 */}
        {showRefPanel && (
          <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">📡 참조 항적</span>
              <button onClick={() => setShowRefPanel(false)} className="text-gray-600 hover:text-white text-xs">✕</button>
            </div>

            {/* 선박 추가 */}
            <div className="p-2 border-b border-gray-800 space-y-1.5">
              <select
                value={refSelectId}
                onChange={e => setRefSelectId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5"
              >
                <option value="">선박 선택...</option>
                {vessels
                  .filter(v => !refTracks[v.id])
                  .map(v => (
                    <option key={v.id} value={v.id}>
                      {v.alias || v.name || v.mmsi}
                    </option>
                  ))}
              </select>
              <div className="flex gap-1">
                <button
                  onClick={() => { handleAddRefTrack(refSelectId); setRefSelectId(""); }}
                  disabled={!refSelectId || refLoading}
                  className="flex-1 px-2 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 text-white text-xs rounded transition"
                >
                  {refLoading ? "로딩..." : "추가"}
                </button>
                <button
                  onClick={handleShowAllTracks}
                  disabled={refLoading}
                  className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 text-gray-300 text-xs rounded transition"
                  title="전체 선박 항적 보기"
                >
                  전체 보기
                </button>
              </div>
            </div>

            {/* 현재 표시 중인 항적 목록 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {Object.keys(refTracks).length === 0 && (
                <div className="text-xs text-gray-600 text-center py-4">
                  참조 항적 없음<br />선박을 선택하여 추가하세요
                </div>
              )}
              {Object.entries(refTracks).map(([id, track]) => (
                <div key={id} className="flex items-center gap-1.5 group">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer"
                    style={{ background: track.color, opacity: track.visible ? 1 : 0.3 }}
                    onClick={() => toggleRefVisible(id)}
                    title={track.visible ? "숨기기" : "보이기"}
                  />
                  <span
                    className={`flex-1 text-xs truncate cursor-pointer ${track.visible ? "text-gray-300" : "text-gray-600"}`}
                    onClick={() => toggleRefVisible(id)}
                  >
                    {track.name}
                  </span>
                  <button
                    onClick={() => removeRefTrack(id)}
                    className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="px-3 py-2 border-t border-gray-800 text-xs text-gray-600">
              클릭: 표시/숨기기
            </div>
          </div>
        )}

        {/* 즐겨찾기 패널 */}
        {showFavPanel && (
          <div className="w-52 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">★ 즐겨찾기 웨이포인트</span>
              <button onClick={() => setShowFavPanel(false)} className="text-gray-600 hover:text-white text-xs">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {favorites.length === 0 && (
                <div className="text-xs text-gray-600 text-center py-4">
                  저장된 웨이포인트 없음<br />
                  웨이포인트 클릭 후<br />
                  "★ 즐겨찾기" 저장
                </div>
              )}
              {favorites.map(fav => (
                <div key={fav.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => insertFavorite(fav)}
                    className="flex-1 text-left px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-white truncate"
                    title={`${fav.lat.toFixed(4)}°, ${fav.lon.toFixed(4)}° — 클릭하면 항로 끝에 추가`}
                  >
                    📍 {fav.name}
                    <span className="block text-gray-500" style={{ fontSize: 9 }}>
                      {fav.lat.toFixed(3)}°, {fav.lon.toFixed(3)}°
                    </span>
                  </button>
                  <button
                    onClick={() => removeFavorite(fav.id)}
                    className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-800 p-2">
              <button
                onClick={handleSaveFavFromCenter}
                className="w-full px-2 py-1.5 bg-amber-800 hover:bg-amber-700 rounded text-xs text-amber-100 transition"
                title="현재 지도 중심 위치를 즐겨찾기에 저장"
              >
                + 지도 중심을 즐겨찾기 저장
              </button>
            </div>
          </div>
        )}

        {/* 지도 영역 */}
        <div className="flex-1 relative">
          <MapContainer
            center={[25.0, 68.0]}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
            zoomControl
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            <MapClickHandler mode={mode} onAdd={handleAdd} />
            <MapCenterTracker centerRef={mapCenterRef} />

            {initialLane && waypoints.length >= 2 && (
              <FitBoundsOnLoad waypoints={waypoints} />
            )}

            {/* 참조 항적들 (얇은 반투명 선) */}
            {Object.entries(refTracks).map(([id, track]) =>
              track.visible && track.positions.length > 1 ? (
                <Polyline
                  key={`ref-${id}`}
                  positions={track.positions}
                  pathOptions={{
                    color: track.color,
                    weight: 1.5,
                    opacity: 0.4,
                    dashArray: "4 4",
                  }}
                >
                  <Tooltip direction="top" opacity={0.85}>
                    <span style={{ fontSize: 11 }}>{track.name} 항적</span>
                  </Tooltip>
                </Polyline>
              ) : null
            )}

            {/* 항로 폴리라인 */}
            {waypoints.length >= 2 && (
              <Polyline
                positions={waypoints}
                pathOptions={{
                  color,
                  weight: 3,
                  opacity: 0.85,
                  dashArray: mode === "add" ? "9 5" : undefined,
                }}
                eventHandlers={{ click: handleLineClick }}
              />
            )}

            {/* 웨이포인트 마커 */}
            {waypoints.map((wp, idx) =>
              mode === "move" ? (
                <Marker
                  key={`wp-${wp[0].toFixed(5)}-${wp[1].toFixed(5)}`}
                  position={wp}
                  draggable
                  icon={moveWpIcon}
                  eventHandlers={{
                    dragstart: handleDragStart,
                    dragend: (e) => handleDragEnd(idx, e),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.85}>
                    <span style={{ fontSize: 11 }}>#{idx + 1}</span>
                  </Tooltip>
                </Marker>
              ) : (
                <CircleMarker
                  key={`wp-${wp[0].toFixed(5)}-${wp[1].toFixed(5)}`}
                  center={wp}
                  radius={mode === "delete" ? 9 : mode === "select" ? 8 : 6}
                  pathOptions={{
                    color: mode === "delete" ? "#ef4444" : mode === "select" ? "#f59e0b" : color,
                    fillColor: mode === "delete" ? "#ef4444" : mode === "select"
                      ? (wpMenu?.idx === idx ? "#f59e0b" : color)
                      : color,
                    fillOpacity: mode === "select" && wpMenu?.idx === idx ? 1 : 0.9,
                    weight: mode === "select" ? (wpMenu?.idx === idx ? 3 : 2) : 2,
                  }}
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent?.stopPropagation();
                      if (mode === "delete") {
                        handleDelete(idx);
                      } else if (mode === "select") {
                        // 선택 모드: 앞/뒤 삽입 메뉴
                        setWpMenu(prev =>
                          prev?.idx === idx ? null : { idx, lat: wp[0], lon: wp[1] }
                        );
                      }
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.85}>
                    <span style={{ fontSize: 11 }}>
                      #{idx + 1}
                      {mode === "select" && " (클릭: 앞/뒤 추가·즐겨찾기)"}
                    </span>
                  </Tooltip>
                </CircleMarker>
              )
            )}
          </MapContainer>

          {/* 웨이포인트 앞/뒤 삽입 메뉴 */}
          {wpMenu && (
            <div
              className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-600 rounded-xl shadow-2xl p-2.5 z-[500] flex flex-col gap-2"
              style={{ minWidth: 220 }}
            >
              <div className="text-xs text-gray-400 text-center mb-0.5">
                웨이포인트 #{wpMenu.idx + 1} 삽입
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleInsertBefore(wpMenu.idx)}
                  disabled={wpMenu.idx === 0}
                  className="flex-1 px-2 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 rounded text-white transition font-medium"
                  title={wpMenu.idx === 0 ? "첫 번째 웨이포인트 앞에는 삽입 불가" : "이 웨이포인트 앞에 새 포인트 삽입"}
                >
                  ↑ 앞에 추가
                </button>
                <button
                  onClick={() => handleInsertAfter(wpMenu.idx)}
                  className="flex-1 px-2 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 rounded text-white transition font-medium"
                  title="이 웨이포인트 뒤에 새 포인트 삽입"
                >
                  ↓ 뒤에 추가
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveFavFromMenu}
                  className="flex-1 px-2 py-1.5 text-xs bg-amber-800 hover:bg-amber-700 rounded text-amber-100 transition"
                >
                  ★ 즐겨찾기 저장
                </button>
                <button
                  onClick={() => setWpMenu(null)}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-400 transition"
                >
                  닫기
                </button>
              </div>
            </div>
          )}

          {/* 빈 지도 안내 */}
          {waypoints.length === 0 && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 400 }}
            >
              <div className="bg-gray-900/80 text-gray-300 text-sm px-5 py-3 rounded-xl shadow-lg text-center">
                <div className="text-2xl mb-1">🗺</div>
                <div>지도를 클릭하여 첫 번째 웨이포인트를 추가하세요</div>
                <div className="text-xs text-gray-500 mt-1">
                  또는 왼쪽 패널에서 즐겨찾기를 클릭하거나<br />
                  "웨이포인트로 변환"으로 기존 항적을 기반으로 생성
                </div>
              </div>
            </div>
          )}

          {/* 삭제 모드 힌트 */}
          {mode === "delete" && waypoints.length > 0 && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-lg pointer-events-none"
              style={{ zIndex: 400 }}
            >
              삭제 모드: 마커를 클릭하면 삭제됩니다
            </div>
          )}

          {/* select 모드 힌트 */}
          {mode === "select" && !wpMenu && waypoints.length > 0 && (
            <div
              className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900/70 text-amber-300/80 text-xs px-3 py-1 rounded-lg pointer-events-none"
              style={{ zIndex: 400 }}
            >
              웨이포인트를 클릭하여 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
