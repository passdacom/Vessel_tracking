/**
 * EtaPanel — 선박 → 목적지 거리/ETA 계산 패널
 *
 * Props:
 *   vessel        - 선택된 선박 객체
 *   position      - 선택된 선박의 최신 위치 { lat, lon, sog }
 *   lanes         - 활성 항로 배열
 *   destination   - { lat, lon, name? } | null
 *   onClose       - 패널 닫기 콜백
 *   onClearDest   - 목적지 초기화 콜백
 *   onResultChange - ETA 계산 결과 변경 콜백 (지도 오버레이용)
 *   apiFetch      - 인증 포함 fetch 헬퍼 (항구 검색용)
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { calcEta, extractLaneSegment, formatHours } from "../utils/etaCalc.js";

const VESSEL_SPEED_PRESETS = [
  { key: "container",   label: "컨테이너선",   sog: 20 },
  { key: "car_carrier", label: "자동차운반선",  sog: 18 },
  { key: "lpg",         label: "LPG/LNG선",    sog: 17 },
  { key: "tanker",      label: "유조선",        sog: 15 },
  { key: "general",     label: "일반화물선",    sog: 14 },
  { key: "bulk",        label: "벌크선",        sog: 13 },
];

function formatDate(d) {
  if (!d) return "--";
  return new Date(d).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Seoul",
  }) + " KST";
}

export default function EtaPanel({
  vessel, position, lanes, destination,
  onClose, onClearDest, onResultChange, apiFetch, onPortPick,
}) {
  const hasDest = destination && destination.lat != null;
  const hasLanes = lanes && lanes.length > 0;

  // ── 목적지 입력 탭: "map" | "port" ───────────────────────────────────────
  const [destTab, setDestTab] = useState("map");

  // ── 항구 검색 상태 ────────────────────────────────────────────────────────
  const [portQuery, setPortQuery] = useState("");
  const [portResults, setPortResults] = useState([]);
  const [portSearching, setPortSearching] = useState(false);
  const [portDropdownOpen, setPortDropdownOpen] = useState(false);
  const portInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // 디바운스 항구 검색
  useEffect(() => {
    const q = portQuery.trim();
    if (!q || !apiFetch) {
      setPortResults([]);
      setPortDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setPortSearching(true);
      try {
        const res = await apiFetch(`/ports?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setPortResults(data.slice(0, 12)); // 최대 12개
          setPortDropdownOpen(data.length > 0);
        }
      } catch (_) {}
      setPortSearching(false);
    }, 280);
    return () => clearTimeout(timer);
  }, [portQuery, apiFetch]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        portInputRef.current && !portInputRef.current.contains(e.target)
      ) {
        setPortDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectPort = useCallback((port) => {
    setPortQuery(port.nameKo || port.name);
    setPortDropdownOpen(false);
    if (typeof onPortPick === "function") {
      onPortPick({ lat: port.lat, lon: port.lon, name: port.nameKo || port.name });
    }
  }, [onPortPick]);

  // ── 속도 설정 ─────────────────────────────────────────────────────────────
  const [speedMode, setSpeedMode] = useState("current");
  const [presetKey, setPresetKey] = useState("container");
  const [manualSog, setManualSog] = useState("12");

  const effectiveSog = useMemo(() => {
    if (speedMode === "preset") return VESSEL_SPEED_PRESETS.find(p => p.key === presetKey)?.sog ?? 12;
    if (speedMode === "manual") { const v = parseFloat(manualSog); return !isNaN(v) && v > 0 ? v : 12; }
    return position?.sog > 0.5 ? position.sog : null;
  }, [speedMode, presetKey, manualSog, position?.sog]);

  // ── ETA 계산 ──────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!hasDest || !position) { setResult(null); onResultChange?.(null); return; }
    const overrideSog = effectiveSog != null ? effectiveSog : undefined;
    const r = calcEta(position, destination, lanes ?? [], { overrideSog });
    if (r) {
      const withSegment = { ...r, segmentCoords: extractLaneSegment(r) };
      setResult(withSegment);
      onResultChange?.(withSegment);
    } else { setResult(null); onResultChange?.(null); }
  }, [destination, lanes, position, effectiveSog]); // eslint-disable-line

  const currentSogLabel = position?.sog > 0.5 ? `현재 (${position.sog.toFixed(1)}kn)` : "현재 (정박)";

  return (
    <div
      className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
      style={{ minWidth: 270, maxWidth: 320, maxHeight: "82vh", overflowY: "auto" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-sm">🧭</span>
          <span className="text-sm font-semibold text-white">거리 / ETA 계산</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-base transition">✕</button>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">

        {/* 출발 선박 */}
        <div className="text-xs text-gray-400">
          출발: <span className="ml-1 font-medium text-white">{vessel?.alias || vessel?.name || vessel?.mmsi || "--"}</span>
        </div>

        {/* 목적지 섹션 */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-gray-400">목적지</div>

          {/* 탭 전환: 지도 클릭 | 항구 선택 */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
            <button
              onClick={() => setDestTab("map")}
              className={`flex-1 py-1 transition ${destTab === "map" ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
            >
              🗺 지도 클릭
            </button>
            <button
              onClick={() => setDestTab("port")}
              className={`flex-1 py-1 transition ${destTab === "port" ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
            >
              ⚓ 항구 선택
            </button>
          </div>

          {/* 현재 설정된 목적지 표시 */}
          {hasDest && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs font-medium text-amber-400">
                {destination.name
                  ? `⚓ ${destination.name}`
                  : `📍 ${destination.lat.toFixed(3)}°, ${destination.lon.toFixed(3)}°`}
              </span>
              <button
                onClick={() => { onClearDest(); setPortQuery(""); }}
                className="text-gray-600 hover:text-red-400 transition text-xs ml-0.5"
                title="목적지 초기화"
              >✕</button>
            </div>
          )}

          {/* 지도 클릭 탭 */}
          {destTab === "map" && !hasDest && (
            <div className="text-xs text-amber-400 animate-pulse py-0.5">
              지도를 클릭하여 목적지를 설정하세요
            </div>
          )}

          {/* 항구 선택 탭 */}
          {destTab === "port" && (
            <div className="relative">
              <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 focus-within:border-blue-500 transition">
                <span className="text-gray-500 text-xs flex-shrink-0">⚓</span>
                <input
                  ref={portInputRef}
                  type="text"
                  value={portQuery}
                  onChange={e => { setPortQuery(e.target.value); setPortDropdownOpen(true); }}
                  onFocus={() => portQuery.trim() && setPortDropdownOpen(true)}
                  placeholder="항구명 검색 (영문/한글)"
                  className="flex-1 bg-transparent text-white text-xs outline-none placeholder-gray-600 min-w-0"
                />
                {portSearching && (
                  <span className="text-gray-600 text-xs flex-shrink-0">…</span>
                )}
                {portQuery && (
                  <button
                    onClick={() => { setPortQuery(""); setPortResults([]); setPortDropdownOpen(false); }}
                    className="text-gray-600 hover:text-gray-400 text-xs flex-shrink-0"
                  >✕</button>
                )}
              </div>

              {/* 드롭다운 결과 */}
              {portDropdownOpen && portResults.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50"
                  style={{ maxHeight: 200, overflowY: "auto" }}
                >
                  {portResults.map(port => (
                    <button
                      key={port.id}
                      onMouseDown={e => e.preventDefault()} // blur 방지
                      onClick={() => handleSelectPort(port)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 transition"
                    >
                      <div className="text-xs font-medium text-white">
                        {port.nameKo ? `${port.nameKo} (${port.name})` : port.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {port.country}{port.unlocode ? ` · ${port.unlocode}` : ""}
                        <span className="ml-1 tabular-nums">{port.lat.toFixed(2)}°, {port.lon.toFixed(2)}°</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {portDropdownOpen && !portSearching && portQuery.trim() && portResults.length === 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500 z-50">
                  검색 결과가 없습니다
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-gray-800" />

        {/* 속도 설정 */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-gray-400">속도 기준</div>
          <div className="flex gap-1 flex-wrap">
            {[
              { key: "current", label: currentSogLabel },
              { key: "preset",  label: "선종별" },
              { key: "manual",  label: "직접 입력" },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSpeedMode(opt.key)}
                className={`px-2 py-0.5 rounded text-xs border transition ${
                  speedMode === opt.key
                    ? "bg-blue-700 border-blue-600 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {speedMode === "preset" && (
            <select
              value={presetKey}
              onChange={e => setPresetKey(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
            >
              {VESSEL_SPEED_PRESETS.map(p => (
                <option key={p.key} value={p.key}>{p.label} (약 {p.sog}kn)</option>
              ))}
            </select>
          )}
          {speedMode === "manual" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={manualSog}
                onChange={e => setManualSog(e.target.value)}
                min="1" max="50" step="0.5"
                className="w-20 bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
              <span className="text-xs text-gray-500">kn</span>
            </div>
          )}
        </div>

        {/* 계산 결과 */}
        {hasDest && result ? (
          <div className="space-y-1.5">
            <div className="h-px bg-gray-700" />
            {!result.usedFallback && result.laneName && (
              <div className="text-xs space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>선박 → 항로 진입</span>
                  <span className="tabular-nums">{result.distVToSnap} nm</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>항로 구간</span>
                  <span className="tabular-nums">{result.laneSegDist} nm</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>항로 이탈 → 목적지</span>
                  <span className="tabular-nums">{result.distDToSnap} nm</span>
                </div>
              </div>
            )}
            <div className="h-px bg-gray-700" />
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">총 거리</span>
              <span className="text-base font-bold text-white tabular-nums">{result.total} nm</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">
                예상 소요
                <span className="ml-1 text-gray-600">({result.effectiveSog.toFixed(1)}kn)</span>
              </span>
              <span className="text-sm font-semibold text-amber-400">{formatHours(result.hours)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-400">예상 도착</span>
              <span className="text-xs font-medium text-blue-400">{formatDate(result.eta)}</span>
            </div>
            <div className="h-px bg-gray-700" />
            {result.usedFallback ? (
              <div className="text-xs text-yellow-600 flex items-center gap-1">
                <span>⚠</span><span>등록된 항로 없음 — 직선거리 계산</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-1.5 rounded flex-shrink-0" style={{ background: result.laneColor }} />
                <span className="text-xs text-gray-400 truncate">항로: {result.laneName}</span>
              </div>
            )}
          </div>
        ) : hasDest ? (
          <div className="text-xs text-gray-500 py-1">계산 중...</div>
        ) : null}

        {!hasLanes && (
          <div className="text-xs text-yellow-700 bg-yellow-900/30 rounded px-2 py-1">
            등록된 항로가 없습니다. Admin에서 표준 항로를 먼저 생성하면 더 정확한 계산이 가능합니다.
          </div>
        )}
      </div>
    </div>
  );
}
