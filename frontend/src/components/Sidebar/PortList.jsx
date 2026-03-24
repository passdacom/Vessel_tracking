import React, { useState, useEffect, useRef } from "react";

export default function PortList({ apiFetch, onSelectPort, selectedPort }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", nameKo: "", lat: "", lon: "", country: "", unlocode: "" });
  const [addError, setAddError] = useState("");
  const inputRef = useRef(null);

  // 항구 목록 불러오기
  const fetchPorts = async (q = "") => {
    setLoading(true);
    try {
      const res = await apiFetch(`/ports${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (res.ok) setPorts(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchPorts(query);
  }, [open]); // eslint-disable-line

  // 검색 디바운스
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchPorts(query), 250);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line

  const handleSelect = (port) => {
    onSelectPort(port);
  };

  const handleDelete = async (e, portId) => {
    e.stopPropagation();
    if (!window.confirm("이 항구를 삭제하시겠습니까?")) return;
    await apiFetch(`/ports/${portId}`, { method: "DELETE" });
    if (selectedPort?.id === portId) onSelectPort(null);
    fetchPorts(query);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError("");
    const res = await apiFetch("/ports", {
      method: "POST",
      body: JSON.stringify({
        name: addForm.name,
        nameKo: addForm.nameKo || undefined,
        lat: parseFloat(addForm.lat),
        lon: parseFloat(addForm.lon),
        country: addForm.country || undefined,
        unlocode: addForm.unlocode || undefined,
      }),
    });
    if (res.ok) {
      setAddForm({ name: "", nameKo: "", lat: "", lon: "", country: "", unlocode: "" });
      setShowAddForm(false);
      fetchPorts(query);
    } else {
      const err = await res.json();
      setAddError(err.error || "추가 실패");
    }
  };

  return (
    <div className="border-b border-gray-700">
      {/* 토글 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition text-xs"
      >
        <span className="flex items-center gap-1.5 font-medium">
          ⚓ 항구 검색
          {selectedPort && (
            <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold truncate max-w-[100px]">
              {selectedPort.nameKo || selectedPort.name}
            </span>
          )}
        </span>
        <span className="text-gray-600 text-[10px]">{open ? "▲" : "▼"}</span>
      </button>

      {/* 펼침 영역 */}
      {open && (
        <div className="px-2 pb-2 bg-gray-850">
          {/* 검색 입력 */}
          <div className="relative mb-2 mt-1">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="항구명·국가·UNLOCODE 검색..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500 pr-7"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm"
              >×</button>
            )}
          </div>

          {/* 항구 목록 */}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {loading && <p className="text-gray-500 text-xs text-center py-3">검색 중...</p>}
            {!loading && ports.length === 0 && (
              <p className="text-gray-600 text-xs text-center py-3">검색 결과 없음</p>
            )}
            {!loading && ports.map(port => {
              const isSelected = selectedPort?.id === port.id;
              return (
                <div
                  key={port.id}
                  onClick={() => handleSelect(isSelected ? null : port)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition group ${
                    isSelected
                      ? "bg-amber-700/40 border border-amber-600/50"
                      : "hover:bg-gray-700 border border-transparent"
                  }`}
                >
                  <span className="text-amber-400 text-xs flex-shrink-0">⚓</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-medium truncate">
                      {port.nameKo || port.name}
                    </div>
                    <div className="text-gray-500 text-[10px] truncate">
                      {port.nameKo ? port.name + " · " : ""}{port.country || ""}
                      {port.unlocode ? ` · ${port.unlocode}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, port.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition text-xs flex-shrink-0 px-1"
                    title="삭제"
                  >✕</button>
                </div>
              );
            })}
          </div>

          {/* 항구 추가 토글 */}
          <div className="mt-2 border-t border-gray-700 pt-2">
            {!showAddForm ? (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full py-1 text-xs text-gray-500 hover:text-amber-400 transition flex items-center justify-center gap-1"
              >
                <span>+</span> 항구 직접 추가
              </button>
            ) : (
              <form onSubmit={handleAdd} className="space-y-1.5">
                <div className="flex gap-1">
                  <input value={addForm.name} onChange={e => setAddForm(p => ({...p, name: e.target.value}))}
                    placeholder="영문명 *" required
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500" />
                  <input value={addForm.nameKo} onChange={e => setAddForm(p => ({...p, nameKo: e.target.value}))}
                    placeholder="한글명"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500" />
                </div>
                <div className="flex gap-1">
                  <input value={addForm.lat} onChange={e => setAddForm(p => ({...p, lat: e.target.value}))}
                    placeholder="위도 *" required type="number" step="any"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500" />
                  <input value={addForm.lon} onChange={e => setAddForm(p => ({...p, lon: e.target.value}))}
                    placeholder="경도 *" required type="number" step="any"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500" />
                </div>
                <div className="flex gap-1">
                  <input value={addForm.country} onChange={e => setAddForm(p => ({...p, country: e.target.value}))}
                    placeholder="국가"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500" />
                  <input value={addForm.unlocode} onChange={e => setAddForm(p => ({...p, unlocode: e.target.value.toUpperCase()}))}
                    placeholder="UNLOCODE"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500" />
                </div>
                {addError && <p className="text-red-400 text-[10px]">{addError}</p>}
                <div className="flex gap-1">
                  <button type="submit"
                    className="flex-1 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded transition">
                    추가
                  </button>
                  <button type="button" onClick={() => { setShowAddForm(false); setAddError(""); }}
                    className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition">
                    취소
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* 선택된 항구 핀 해제 */}
          {selectedPort && (
            <button
              onClick={() => onSelectPort(null)}
              className="w-full mt-1 py-0.5 text-[10px] text-amber-600 hover:text-amber-400 transition"
            >
              ✕ 핀 제거 ({selectedPort.nameKo || selectedPort.name})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
