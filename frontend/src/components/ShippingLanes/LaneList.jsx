import React, { useState, useEffect, useCallback } from "react";

function ColorDot({ color }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full flex-shrink-0"
      style={{ background: color || "#f59e0b" }}
    />
  );
}

export default function LaneList({ apiFetch, onNew, onEdit, onClose }) {
  const [lanes, setLanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState("");
  const [showAll, setShowAll] = useState(false);

  const fetchLanes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/lanes${showAll ? "?active=all" : ""}`);
      if (res.ok) {
        setLanes(await res.json());
      } else {
        setError("항로 목록을 불러오지 못했습니다");
      }
    } catch (e) {
      setError("네트워크 오류");
    }
    setLoading(false);
  }, [apiFetch, showAll]);

  useEffect(() => { fetchLanes(); }, [fetchLanes]);

  const handleToggleActive = async (lane) => {
    try {
      const res = await apiFetch(`/lanes/${lane.id}`, {
        method: "PUT",
        body: JSON.stringify({ active: !lane.active }),
      });
      if (res.ok) {
        setActionMsg(`"${lane.name}" ${!lane.active ? "활성화" : "비활성화"} 완료`);
        fetchLanes();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMsg(err.error || "변경 실패");
      }
    } catch {
      setActionMsg("네트워크 오류");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleDelete = async (lane) => {
    if (!window.confirm(`"${lane.name}" 항로를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      const res = await apiFetch(`/lanes/${lane.id}`, { method: "DELETE" });
      if (res.ok) {
        setActionMsg(`"${lane.name}" 삭제 완료`);
        fetchLanes();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMsg(err.error || "삭제 실패");
      }
    } catch {
      setActionMsg("네트워크 오류");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* 헤더 */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition p-1 rounded"
              title="대시보드로 돌아가기"
            >
              ← 뒤로
            </button>
            <div>
              <h2 className="text-lg font-bold">항로 관리</h2>
              <p className="text-xs text-gray-500">표준 항로 생성 및 편집 (admin 전용)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-500"
              />
              비활성 포함
            </label>
            <button
              onClick={() => onNew()}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-sm rounded-lg transition flex items-center gap-1.5 font-medium"
            >
              + 새 항로
            </button>
          </div>
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {/* 액션 메시지 */}
          {actionMsg && (
            <div className="mb-4 px-4 py-2 bg-blue-900/60 border border-blue-700 rounded-lg text-sm text-blue-200">
              {actionMsg}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-500">불러오는 중...</div>
          ) : error ? (
            <div className="text-center py-16 text-red-400">
              <p>{error}</p>
              <button
                onClick={fetchLanes}
                className="mt-3 text-sm text-blue-400 hover:underline"
              >
                다시 시도
              </button>
            </div>
          ) : lanes.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🗺</div>
              <p className="text-gray-400 mb-2">등록된 항로가 없습니다</p>
              <p className="text-sm text-gray-600 mb-6">
                표준 항로를 만들면 선박 위치에서 목적지까지의 거리 계산에 활용할 수 있습니다
              </p>
              <button
                onClick={() => onNew()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition"
              >
                첫 항로 만들기
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">
                총 {lanes.length}개 항로
                {!showAll && lanes.some((l) => !l.active) ? "" : ""}
              </p>
              {lanes.map((lane) => {
                const ptCount = Array.isArray(lane.coordinates) ? lane.coordinates.length : 0;
                const createdAt = new Date(lane.createdAt).toLocaleDateString("ko-KR");
                return (
                  <div
                    key={lane.id}
                    className={`rounded-lg border px-4 py-3 flex items-center gap-3 transition ${
                      lane.active
                        ? "bg-gray-900 border-gray-700 hover:border-gray-600"
                        : "bg-gray-900/50 border-gray-800 opacity-60"
                    }`}
                  >
                    <ColorDot color={lane.color} />

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{lane.name}</span>
                        {!lane.active && (
                          <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded flex-shrink-0">
                            비활성
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span>{ptCount}개 웨이포인트</span>
                        {lane.description && (
                          <span className="truncate max-w-xs">{lane.description}</span>
                        )}
                        <span className="flex-shrink-0">{createdAt} by {lane.createdBy}</span>
                      </div>
                    </div>

                    {/* 버튼 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(lane)}
                        className={`px-2.5 py-1 text-xs rounded transition ${
                          lane.active
                            ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                            : "bg-green-800 hover:bg-green-700 text-green-200"
                        }`}
                        title={lane.active ? "비활성화" : "활성화"}
                      >
                        {lane.active ? "숨기기" : "표시"}
                      </button>
                      <button
                        onClick={() => onEdit(lane)}
                        className="px-2.5 py-1 text-xs rounded bg-blue-800 hover:bg-blue-700 text-blue-200 transition"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => handleDelete(lane)}
                        className="px-2.5 py-1 text-xs rounded bg-red-900 hover:bg-red-800 text-red-300 transition"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
