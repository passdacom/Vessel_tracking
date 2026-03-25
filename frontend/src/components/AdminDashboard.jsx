import React, { useState, useEffect, useCallback } from "react";

function formatDate(d) {
  if (!d) return "--";
  const date = new Date(d);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function lastSeenText(timestamp) {
  if (!timestamp) return "신호 없음";
  const secs = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (secs < 60) return `${secs}초 전`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function AdminDashboard({ apiFetch, onLogout }) {
  const [overview, setOverview] = useState(null);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState(null); // null = all
  const [actionMsg, setActionMsg] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [ovRes, vsRes] = await Promise.all([
        apiFetch("/admin/overview"),
        apiFetch("/admin/vessels"),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (vsRes.ok) setVessels(await vsRes.json());
    } catch (e) {
      console.error("Admin fetch error:", e);
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMoveVessel = async (vesselId, targetAccount) => {
    const res = await apiFetch(`/admin/vessels/${vesselId}/account`, {
      method: "PATCH",
      body: JSON.stringify({ account: targetAccount }),
    });
    if (res.ok) {
      setActionMsg(`선박 ${vesselId}를 ${targetAccount} 계정으로 이동 완료`);
      fetchData();
    } else {
      setActionMsg("이동 실패");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleDeleteVessel = async (vesselId, vesselName) => {
    if (!window.confirm(`"${vesselName}"을 삭제하시겠습니까? 위치 데이터도 모두 삭제됩니다.`)) return;
    const res = await apiFetch(`/vessels/${vesselId}`, { method: "DELETE" });
    if (res.ok) {
      setActionMsg(`선박 "${vesselName}" 삭제 완료`);
      fetchData();
    } else {
      setActionMsg("삭제 실패");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleToggleActive = async (vesselId, currentActive) => {
    const res = await apiFetch(`/vessels/${vesselId}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !currentActive }),
    });
    if (res.ok) {
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  const filteredVessels = selectedAccount
    ? vessels.filter((v) => v.account === selectedAccount)
    : vessels;

  const accountNames = overview?.accounts?.map((a) => a.name) || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚓</span>
            <div>
              <h1 className="text-lg font-bold">Vessel Tracker Admin</h1>
              <p className="text-xs text-gray-500">관리자 대시보드</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition"
          >
            로그아웃
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* API 사용량 카드 */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">이번 달 API 사용량</div>
              <div className="text-2xl font-bold text-blue-400">
                {overview.api.monthlyUsed.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">/ {overview.api.monthlyLimit.toLocaleString()} 크레딧</div>
              <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (overview.api.monthlyUsed / overview.api.monthlyLimit) * 100)}%`,
                    backgroundColor: overview.api.monthlyUsed / overview.api.monthlyLimit > 0.8 ? "#ef4444" : "#3b82f6",
                  }}
                />
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">잔여 크레딧</div>
              <div className={`text-2xl font-bold ${overview.api.monthlyRemaining < 2000 ? "text-red-400" : "text-green-400"}`}>
                {overview.api.monthlyRemaining.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                시스템(폴링): {overview.api.systemUsed.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">총 선박 수</div>
              <div className="text-2xl font-bold text-white">{vessels.length}</div>
              <div className="text-xs text-gray-500 mt-1">
                활성: {vessels.filter((v) => v.active !== false).length} / 보관: {vessels.filter((v) => v.active === false).length}
              </div>
            </div>
          </div>
        )}

        {/* 계정별 요약 */}
        {overview && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">계정별 현황</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {overview.accounts.map((acct) => (
                <button
                  key={acct.name}
                  onClick={() => setSelectedAccount(selectedAccount === acct.name ? null : acct.name)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition text-left ${
                    selectedAccount === acct.name
                      ? "bg-blue-900/30 border-blue-600"
                      : "bg-gray-800 border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">{acct.name.toUpperCase()}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      선박 {acct.vesselCount}척 · 크레딧 {acct.monthlyCredits}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-400">{acct.vesselCount}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 알림 */}
        {actionMsg && (
          <div className="bg-green-900/50 border border-green-700 text-green-300 text-sm rounded-lg px-4 py-2">
            {actionMsg}
          </div>
        )}

        {/* 선박 목록 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">
              선박 목록
              {selectedAccount && (
                <span className="ml-2 text-xs text-blue-400">
                  ({selectedAccount.toUpperCase()})
                  <button
                    onClick={() => setSelectedAccount(null)}
                    className="ml-1 text-gray-500 hover:text-white"
                  >
                    ✕
                  </button>
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-500">{filteredVessels.length}척</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-2">계정</th>
                  <th className="text-left px-4 py-2">선박명</th>
                  <th className="text-left px-4 py-2">MMSI</th>
                  <th className="text-left px-4 py-2">상태</th>
                  <th className="text-left px-4 py-2">마지막 신호</th>
                  <th className="text-left px-4 py-2">폴링</th>
                  <th className="text-right px-4 py-2">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredVessels.map((v) => {
                  const pos = v.positions?.[0];
                  const isActive = v.active !== false;
                  return (
                    <tr
                      key={v.id}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/50 ${!isActive ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">
                          {v.account}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                          <span className="font-medium truncate max-w-[150px]">
                            {v.alias || v.name || v.mmsi}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-400 text-xs">{v.mmsi}</td>
                      <td className="px-4 py-2">
                        {pos ? (
                          <span className={`text-xs ${Date.now() - new Date(pos.timestamp) < 3600000 ? "text-green-400" : "text-yellow-400"}`}>
                            {Date.now() - new Date(pos.timestamp) < 3600000 ? "● 활성" : "⚠ 지연"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">데이터 없음</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        {pos ? lastSeenText(pos.timestamp) : "--"}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleToggleActive(v.id, isActive)}
                          className={`text-xs px-2 py-0.5 rounded transition ${
                            isActive
                              ? "bg-green-900/50 text-green-400 hover:bg-green-800/50"
                              : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                          }`}
                        >
                          {isActive ? "ON" : "OFF"}
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* 계정 이동 */}
                          <select
                            value={v.account}
                            onChange={(e) => {
                              if (e.target.value !== v.account) handleMoveVessel(v.id, e.target.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-gray-800 text-gray-400 text-xs rounded px-1 py-0.5 border border-gray-700 cursor-pointer"
                          >
                            {accountNames.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleDeleteVessel(v.id, v.alias || v.name || v.mmsi)}
                            className="text-xs px-1.5 py-0.5 text-gray-500 hover:text-red-400 hover:bg-red-950 rounded transition"
                            title="삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredVessels.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-600">
                      선박이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 일별 API 사용량 */}
        {overview?.api?.dailyUsage?.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">최근 API 사용량 (일별)</h2>
            <div className="space-y-1">
              {overview.api.dailyUsage.slice(0, 14).map((d) => {
                const dateStr = new Date(d.date).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
                const barWidth = Math.min(100, (d.credits / Math.max(...overview.api.dailyUsage.map(x => x.credits))) * 100);
                return (
                  <div key={d.date} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-gray-500 text-right">{dateStr}</span>
                    <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-600/60 rounded"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="w-12 text-gray-400 text-right font-mono">{d.credits}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
