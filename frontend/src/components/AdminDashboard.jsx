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

// ─── API 사용량 예측 계산 ───────────────────────────────────────────────────
function calcApiPrediction(overview) {
  if (!overview) return null;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const totalDays = new Date(year, month + 1, 0).getDate(); // 이번 달 총 일수
  const daysElapsed = now.getDate();                         // 오늘까지 경과 일수
  const daysRemaining = totalDays - daysElapsed;             // 남은 일수

  // 이번 달 실제 일별 데이터만 추출 (최근순)
  const thisMonthDays = (overview.api.dailyUsage || []).filter((d) => {
    const dd = new Date(d.date);
    return dd.getFullYear() === year && dd.getMonth() === month;
  });

  // 최근 7일 평균 (없으면 월 누적/경과일로 추정)
  let dailyAvg;
  if (thisMonthDays.length > 0) {
    const recent = thisMonthDays.slice(0, Math.min(7, thisMonthDays.length));
    dailyAvg = recent.reduce((s, d) => s + d.credits, 0) / recent.length;
  } else {
    dailyAvg = daysElapsed > 0 ? overview.api.monthlyUsed / daysElapsed : 0;
  }

  const predictedAdditional = Math.round(dailyAvg * daysRemaining);
  const predictedTotal = overview.api.monthlyUsed + predictedAdditional;
  const limit = overview.api.monthlyLimit;
  const ratio = predictedTotal / limit;

  return {
    totalDays,
    daysElapsed,
    daysRemaining,
    dailyAvg: Math.round(dailyAvg),
    predictedTotal,
    predictedRemaining: Math.max(0, limit - predictedTotal),
    ratio,
    riskLevel: ratio > 1 ? "danger" : ratio > 0.85 ? "warning" : "safe",
  };
}

export default function AdminDashboard({ apiFetch, onLogout, onSwitchToMap }) {
  const [overview, setOverview] = useState(null);
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [actionMsg, setActionMsg] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [showPwChange, setShowPwChange] = useState(null);
  const [newPw, setNewPw] = useState("");

  // ── 계정 관리 상태 ──
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccPw, setNewAccPw] = useState("");
  const [newAccLimit, setNewAccLimit] = useState(100);
  const [showEditLimit, setShowEditLimit] = useState(null); // account name
  const [editLimitVal, setEditLimitVal] = useState(100);

  // ── 폴링 설정 상태 ──
  const [settings, setSettings] = useState(null);
  const [editCron, setEditCron] = useState("");
  const [editCronSaving, setEditCronSaving] = useState(false);

  // ── 데이터 강제 수신 상태 ──
  const [fetchVesselId, setFetchVesselId] = useState("");
  const [fetchDays, setFetchDays] = useState(7);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchResult, setFetchResult] = useState(null); // { fetched, stored, credits_used, error }
  const [fetchLog, setFetchLog] = useState("");

  // ── Zone Events 상태 ──
  const [zoneEvents, setZoneEvents] = useState([]);
  const [zoneEventsLoading, setZoneEventsLoading] = useState(false);
  const [zoneEventsFilter, setZoneEventsFilter] = useState(""); // "" | "entry" | "exit"
  const [zoneEventsTotal, setZoneEventsTotal] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [ovRes, vsRes, acRes, stRes] = await Promise.all([
        apiFetch("/admin/overview"),
        apiFetch("/admin/vessels"),
        apiFetch("/admin/accounts"),
        apiFetch("/admin/settings"),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (vsRes.ok) setVessels(await vsRes.json());
      if (acRes.ok) setAccounts(await acRes.json());
      if (stRes.ok) {
        const s = await stRes.json();
        setSettings(s);
        setEditCron(s.poll_cron || "0 4,6,8,11,15,23 * * *");
      }
    } catch (e) {
      console.error("Admin fetch error:", e);
    }
    setLoading(false);
  }, [apiFetch]);

  const fetchZoneEvents = useCallback(async (filter = "") => {
    setZoneEventsLoading(true);
    try {
      const qs = filter ? `?eventType=${filter}&limit=50` : "?limit=50";
      const res = await apiFetch(`/admin/zone-events${qs}`);
      if (res.ok) {
        const data = await res.json();
        setZoneEvents(data.events || []);
        setZoneEventsTotal(data.total || 0);
      }
    } catch (e) {
      console.error("Zone events fetch error:", e);
    }
    setZoneEventsLoading(false);
  }, [apiFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchZoneEvents(zoneEventsFilter); }, [fetchZoneEvents, zoneEventsFilter]);

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

  const handleChangePassword = async (accountName) => {
    if (!newPw || newPw.length < 4) { setActionMsg("비밀번호는 4자 이상"); return; }
    const res = await apiFetch(`/admin/accounts/${accountName}/password`, {
      method: "PATCH",
      body: JSON.stringify({ newPassword: newPw }),
    });
    if (res.ok) {
      setActionMsg(`${accountName} 비밀번호 변경 완료`);
      setShowPwChange(null);
      setNewPw("");
    } else {
      setActionMsg("변경 실패");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleToggleActive = async (vesselId, currentActive) => {
    const res = await apiFetch(`/vessels/${vesselId}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !currentActive }),
    });
    if (res.ok) { fetchData(); }
  };

  const handleCreateAccount = async () => {
    if (!newAccName || newAccPw.length < 4) {
      setActionMsg("계정명과 비밀번호(4자 이상)를 입력해주세요");
      setTimeout(() => setActionMsg(""), 3000);
      return;
    }
    const res = await apiFetch("/admin/accounts", {
      method: "POST",
      body: JSON.stringify({ name: newAccName, password: newAccPw, vesselLimit: newAccLimit }),
    });
    if (res.ok) {
      setActionMsg(`계정 "${newAccName}" 생성 완료`);
      setShowCreateAccount(false);
      setNewAccName(""); setNewAccPw(""); setNewAccLimit(100);
      fetchData();
    } else {
      const err = await res.json();
      setActionMsg(err.error || "생성 실패");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleDeleteAccount = async (accountName) => {
    if (!window.confirm(`"${accountName}" 계정을 삭제하시겠습니까?`)) return;
    const res = await apiFetch(`/admin/accounts/${accountName}`, { method: "DELETE" });
    if (res.ok) {
      setActionMsg(`계정 "${accountName}" 삭제 완료`);
      fetchData();
    } else {
      const err = await res.json();
      setActionMsg(err.error || "삭제 실패");
    }
    setTimeout(() => setActionMsg(""), 4000);
  };

  const handleUpdateLimit = async (accountName) => {
    const res = await apiFetch(`/admin/accounts/${accountName}/vessel-limit`, {
      method: "PATCH",
      body: JSON.stringify({ vesselLimit: editLimitVal }),
    });
    if (res.ok) {
      setActionMsg(`${accountName} 선박 한도 → ${editLimitVal}척`);
      setShowEditLimit(null);
      fetchData();
    } else {
      const err = await res.json();
      setActionMsg(err.error || "변경 실패");
    }
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleSaveSettings = async () => {
    setEditCronSaving(true);
    const res = await apiFetch("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ poll_cron: editCron }),
    });
    if (res.ok) {
      setActionMsg("폴링 스케줄 저장 완료");
      const data = await res.json();
      setSettings((prev) => ({ ...prev, ...data }));
    } else {
      const err = await res.json();
      setActionMsg(err.error || "저장 실패");
    }
    setEditCronSaving(false);
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleTogglePoll = async (enabled) => {
    const res = await apiFetch("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ poll_enabled: enabled }),
    });
    if (res.ok) {
      setActionMsg(enabled ? "폴링 활성화" : "폴링 비활성화");
      setSettings((prev) => ({ ...prev, poll_enabled: enabled }));
    }
    setTimeout(() => setActionMsg(""), 3000);
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

  const prediction = calcApiPrediction(overview);

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
          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchToMap}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-sm rounded-lg transition flex items-center gap-1.5"
              title="지도 뷰로 전환"
            >
              🗺 지도 보기
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition"
            >
              로그아웃
            </button>
          </div>
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

        {/* API 사용량 예측 카드 */}
        {prediction && (
          <div className={`border rounded-xl p-4 ${
            prediction.riskLevel === "danger"
              ? "bg-red-950/40 border-red-800"
              : prediction.riskLevel === "warning"
              ? "bg-yellow-950/40 border-yellow-800"
              : "bg-gray-900 border-gray-800"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-300">월말 API 사용량 예측</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                prediction.riskLevel === "danger"
                  ? "bg-red-900 text-red-300"
                  : prediction.riskLevel === "warning"
                  ? "bg-yellow-900 text-yellow-300"
                  : "bg-green-900 text-green-300"
              }`}>
                {prediction.riskLevel === "danger" ? "⚠ 한도 초과 예상" : prediction.riskLevel === "warning" ? "⚠ 주의" : "✓ 안전"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">예측 월말 사용량</div>
                <div className={`text-xl font-bold ${
                  prediction.riskLevel === "danger" ? "text-red-400" : prediction.riskLevel === "warning" ? "text-yellow-400" : "text-blue-400"
                }`}>
                  {prediction.predictedTotal.toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-600">/ {overview.api.monthlyLimit.toLocaleString()} 한도</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">예측 잔여 크레딧</div>
                <div className={`text-xl font-bold ${prediction.predictedRemaining === 0 ? "text-red-400" : "text-gray-300"}`}>
                  {prediction.predictedRemaining > 0 ? prediction.predictedRemaining.toLocaleString() : "부족"}
                </div>
                <div className="text-[10px] text-gray-600">예측 기준</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">일평균 사용량</div>
                <div className="text-xl font-bold text-gray-300">{prediction.dailyAvg.toLocaleString()}</div>
                <div className="text-[10px] text-gray-600">최근 7일 평균</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 mb-0.5">경과 / 남은 일수</div>
                <div className="text-xl font-bold text-gray-300">
                  {prediction.daysElapsed}<span className="text-gray-600 text-sm">일</span>
                  {" / "}
                  {prediction.daysRemaining}<span className="text-gray-600 text-sm">일</span>
                </div>
                <div className="text-[10px] text-gray-600">총 {prediction.totalDays}일</div>
              </div>
            </div>

            {/* 예측 프로그레스 바 */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>현재 사용 ({overview.api.monthlyUsed.toLocaleString()})</span>
                <span>예측 추가 (+{(prediction.predictedTotal - overview.api.monthlyUsed).toLocaleString()})</span>
                <span>한도 {overview.api.monthlyLimit.toLocaleString()}</span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex">
                {/* 현재 사용 */}
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(100, (overview.api.monthlyUsed / overview.api.monthlyLimit) * 100)}%` }}
                />
                {/* 예측 추가분 */}
                <div
                  className={`h-full transition-all opacity-60 ${
                    prediction.riskLevel === "danger" ? "bg-red-500" : prediction.riskLevel === "warning" ? "bg-yellow-500" : "bg-blue-400"
                  }`}
                  style={{
                    width: `${Math.min(
                      100 - Math.min(100, (overview.api.monthlyUsed / overview.api.monthlyLimit) * 100),
                      ((prediction.predictedTotal - overview.api.monthlyUsed) / overview.api.monthlyLimit) * 100
                    )}%`
                  }}
                />
              </div>
              <div className="text-[10px] text-gray-600 text-right">
                예측 사용률 {Math.round(prediction.ratio * 100)}%
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

        {/* ── 계정 관리 ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-300">계정 관리</h2>
            <button
              onClick={() => { setShowCreateAccount((v) => !v); setNewAccName(""); setNewAccPw(""); setNewAccLimit(100); }}
              className="text-xs px-2 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded transition"
            >
              + 계정 추가
            </button>
          </div>

          {/* 계정 추가 폼 */}
          {showCreateAccount && (
            <div className="mb-3 bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">계정명</label>
                  <input
                    type="text"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    placeholder="예: kdgc2"
                    className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">비밀번호 (4자 이상)</label>
                  <input
                    type="text"
                    value={newAccPw}
                    onChange={(e) => setNewAccPw(e.target.value)}
                    placeholder="초기 비밀번호"
                    className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">선박 한도</label>
                  <input
                    type="number"
                    value={newAccLimit}
                    onChange={(e) => setNewAccLimit(parseInt(e.target.value) || 100)}
                    min={1} max={1000}
                    className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleCreateAccount} className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">생성</button>
                <button onClick={() => setShowCreateAccount(false)} className="text-xs px-3 py-1 bg-gray-700 text-gray-400 rounded">취소</button>
              </div>
            </div>
          )}

          {/* 계정 목록 */}
          <div className="space-y-2">
            {accounts.map((acct) => {
              const acctOverview = overview?.accounts?.find((a) => a.name === acct.name);
              const usedVessels = acctOverview?.vesselCount ?? 0;
              const limitVal = acct.vesselLimit ?? 100;
              return (
                <div key={acct.name} className="bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{acct.name.toUpperCase()}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${acct.role === "admin" ? "bg-yellow-900 text-yellow-400" : "bg-gray-700 text-gray-400"}`}>
                        {acct.role}
                      </span>
                      {acct.role !== "admin" && (
                        <span className="text-[10px] text-gray-500">
                          선박 {usedVessels}/{limitVal}척
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* 선박 한도 변경 */}
                      {acct.role !== "admin" && (
                        showEditLimit === acct.name ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editLimitVal}
                              onChange={(e) => setEditLimitVal(parseInt(e.target.value) || 1)}
                              min={1} max={1000}
                              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 w-16"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateLimit(acct.name); }}
                            />
                            <span className="text-[10px] text-gray-500">척</span>
                            <button onClick={() => handleUpdateLimit(acct.name)} className="text-xs px-1.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">저장</button>
                            <button onClick={() => setShowEditLimit(null)} className="text-xs px-1.5 py-1 bg-gray-700 text-gray-400 rounded">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setShowEditLimit(acct.name); setEditLimitVal(limitVal); }}
                            className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition"
                            title="선박 한도 변경"
                          >
                            한도수정
                          </button>
                        )
                      )}
                      {/* 비밀번호 변경 */}
                      {showPwChange === acct.name ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="새 비밀번호"
                            className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 w-28"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(acct.name); }}
                          />
                          <button onClick={() => handleChangePassword(acct.name)} className="text-xs px-1.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">변경</button>
                          <button onClick={() => { setShowPwChange(null); setNewPw(""); }} className="text-xs px-1.5 py-1 bg-gray-700 text-gray-400 rounded">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowPwChange(acct.name); setNewPw(""); }}
                          className="text-[10px] px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition"
                        >
                          비밀번호
                        </button>
                      )}
                      {/* 계정 삭제 (admin 불가) */}
                      {acct.role !== "admin" && showPwChange !== acct.name && showEditLimit !== acct.name && (
                        <button
                          onClick={() => handleDeleteAccount(acct.name)}
                          className="text-[10px] px-2 py-1 text-gray-600 hover:text-red-400 hover:bg-red-950 rounded transition"
                          title="계정 삭제"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  {/* 선박 한도 프로그레스 바 */}
                  {acct.role !== "admin" && (
                    <div className="mt-1.5">
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${usedVessels / limitVal > 0.9 ? "bg-red-500" : usedVessels / limitVal > 0.7 ? "bg-yellow-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, (usedVessels / limitVal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 폴링 스케줄 설정 ── */}
        {settings && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-300">API 폴링 스케줄</h2>
                <p className="text-[10px] text-gray-600 mt-0.5">cron 표현식 (UTC 기준) · KST = UTC+9</p>
              </div>
              <button
                onClick={() => handleTogglePoll(settings.poll_enabled === false || settings.poll_enabled === "false")}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${
                  settings.poll_enabled === false || settings.poll_enabled === "false"
                    ? "bg-gray-700 text-gray-400 hover:bg-green-900 hover:text-green-400"
                    : "bg-green-900/50 text-green-400 hover:bg-red-900/50 hover:text-red-400"
                }`}
              >
                {settings.poll_enabled === false || settings.poll_enabled === "false" ? "● 비활성" : "● 활성"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editCron}
                onChange={(e) => setEditCron(e.target.value)}
                placeholder="0 4,6,8,11,15,23 * * *"
                className="flex-1 bg-gray-800 border border-gray-700 text-white text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
              />
              <button
                onClick={handleSaveSettings}
                disabled={editCronSaving}
                className="text-xs px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition"
              >
                {editCronSaving ? "저장 중..." : "저장"}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {[
                { label: "KST 기본 (6회/일)", value: "0 4,6,8,11,15,23 * * *" },
                { label: "4시간마다", value: "0 */4 * * *" },
                { label: "6시간마다", value: "0 */6 * * *" },
                { label: "매시간", value: "0 * * * *" },
                { label: "KST 08:00 1회", value: "0 23 * * *" },
                { label: "KST 08/20시", value: "0 23,11 * * *" },
              ].map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setEditCron(preset.value)}
                  className={`text-[10px] px-2 py-1 rounded border transition text-left ${
                    editCron === preset.value
                      ? "border-blue-600 bg-blue-900/30 text-blue-300"
                      : "border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-600"
                  }`}
                >
                  <span className="block font-mono">{preset.value}</span>
                  <span className="text-gray-600">{preset.label}</span>
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

        {/* ── 데이터 강제 수신 ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">선박 데이터 강제 수신</h2>
              <p className="text-[10px] text-gray-600 mt-0.5">
                Datalastic vessel_hist API 호출 — 1일당 1크레딧 소모
              </p>
            </div>
            {fetchResult && (
              <button
                onClick={() => { setFetchResult(null); setFetchLog(""); }}
                className="text-[10px] text-gray-600 hover:text-gray-400"
              >
                결과 닫기
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {/* 선박 선택 */}
            <div className="sm:col-span-2">
              <label className="text-[10px] text-gray-500 block mb-1">대상 선박</label>
              <select
                value={fetchVesselId}
                onChange={(e) => { setFetchVesselId(e.target.value); setFetchResult(null); }}
                className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-600"
              >
                <option value="">— 선박 선택 —</option>
                {vessels
                  .filter((v) => v.active !== false)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      [{v.account}] {v.alias || v.name || v.mmsi} ({v.mmsi})
                    </option>
                  ))}
              </select>
            </div>

            {/* 기간 선택 */}
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">
                수신 기간 — <span className="text-yellow-400 font-mono">{fetchDays}일</span>
                <span className="text-gray-600"> ({fetchDays} 크레딧)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min="1" max="30" step="1"
                  value={fetchDays}
                  onChange={(e) => setFetchDays(parseInt(e.target.value))}
                  className="flex-1 h-1 accent-blue-500 cursor-pointer"
                />
                <input
                  type="number" min="1" max="30"
                  value={fetchDays}
                  onChange={(e) => setFetchDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-12 bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 text-center"
                />
              </div>
              <p className="text-[10px] text-gray-600 mt-1">현재 시점 기준 최근 {fetchDays}일</p>
            </div>
          </div>

          {/* 실행 버튼 */}
          <button
            onClick={async () => {
              if (!fetchVesselId) return;
              setFetchLoading(true);
              setFetchResult(null);
              setFetchLog(`📡 ${fetchDays}일치 위치 데이터 수신 중...`);
              try {
                const res = await apiFetch(`/vessels/${fetchVesselId}/history`, {
                  method: "POST",
                  body: JSON.stringify({ days: fetchDays }),
                });
                const data = await res.json();
                if (res.ok) {
                  setFetchResult({ ...data, success: true });
                  setFetchLog(`✅ 완료: ${data.fetched}건 수신, ${data.stored}건 저장 (${data.credits_used} 크레딧 소모)`);
                  fetchData(); // API 사용량 카드 갱신
                } else {
                  setFetchResult({ error: data.error || "알 수 없는 오류", success: false });
                  setFetchLog(`❌ 오류: ${data.error || "API 호출 실패"}`);
                }
              } catch (e) {
                setFetchResult({ error: e.message, success: false });
                setFetchLog(`❌ 네트워크 오류: ${e.message}`);
              }
              setFetchLoading(false);
            }}
            disabled={!fetchVesselId || fetchLoading}
            className={`w-full py-2 text-sm font-medium rounded-lg transition flex items-center justify-center gap-2 ${
              !fetchVesselId || fetchLoading
                ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                : "bg-blue-700 hover:bg-blue-600 text-white"
            }`}
          >
            {fetchLoading ? (
              <><span className="animate-pulse">⏳</span> 수신 중...</>
            ) : (
              <><span>📥</span> 데이터 강제 수신 ({fetchDays} 크레딧)</>
            )}
          </button>

          {/* 결과 표시 */}
          {fetchLog && (
            <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-mono ${
              fetchResult?.success
                ? "bg-green-950 border border-green-800 text-green-300"
                : fetchResult?.error
                ? "bg-red-950 border border-red-800 text-red-300"
                : "bg-gray-800 border border-gray-700 text-gray-400"
            }`}>
              {fetchLog}
              {fetchResult?.success && (
                <div className="mt-1.5 grid grid-cols-3 gap-2 pt-1.5 border-t border-green-900">
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-400">{fetchResult.fetched}</div>
                    <div className="text-[10px] text-gray-500">API 수신</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-400">{fetchResult.stored}</div>
                    <div className="text-[10px] text-gray-500">신규 저장</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-yellow-400">{fetchResult.credits_used}</div>
                    <div className="text-[10px] text-gray-500">크레딧 소모</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Zone Events 로그 ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-300">HRA 구역 진입/이탈 이력</h2>
              <p className="text-[10px] text-gray-600 mt-0.5">전체 {zoneEventsTotal}건</p>
            </div>
            <div className="flex items-center gap-2">
              {/* 필터 버튼 */}
              {["", "entry", "exit"].map((f) => (
                <button
                  key={f}
                  onClick={() => setZoneEventsFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                    zoneEventsFilter === f
                      ? f === "entry"
                        ? "bg-red-800 border-red-600 text-red-200"
                        : f === "exit"
                        ? "bg-green-800 border-green-600 text-green-200"
                        : "bg-blue-800 border-blue-600 text-blue-200"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {f === "" ? "전체" : f === "entry" ? "🔴 진입" : "🟢 이탈"}
                </button>
              ))}
              <button
                onClick={() => fetchZoneEvents(zoneEventsFilter)}
                disabled={zoneEventsLoading}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-400 transition"
                title="새로고침"
              >
                {zoneEventsLoading ? "⏳" : "↻"}
              </button>
            </div>
          </div>

          {zoneEventsLoading ? (
            <div className="px-4 py-6 text-center text-gray-600 text-sm">로딩 중...</div>
          ) : zoneEvents.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-600 text-sm">
              {zoneEventsFilter === "entry" ? "진입 이력 없음" : zoneEventsFilter === "exit" ? "이탈 이력 없음" : "구역 진입/이탈 이력 없음"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="text-left px-4 py-2">구분</th>
                    <th className="text-left px-4 py-2">선박</th>
                    <th className="text-left px-4 py-2">구역</th>
                    <th className="text-left px-4 py-2">위치</th>
                    <th className="text-left px-4 py-2">위치시간</th>
                    <th className="text-left px-4 py-2">감지시간</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneEvents.map((ev) => (
                    <tr key={ev.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          ev.eventType === "entry"
                            ? "bg-red-900/60 text-red-300"
                            : "bg-green-900/60 text-green-300"
                        }`}>
                          {ev.eventType === "entry" ? "진입" : "이탈"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium text-white truncate max-w-[120px]">
                          {ev.vessel?.alias || ev.vessel?.name || ev.vessel?.mmsi}
                        </div>
                        <div className="text-[10px] text-gray-500">{ev.vessel?.account}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-300 max-w-[180px]">
                        <span className="truncate block" title={ev.zoneName}>{ev.zoneName}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500 font-mono">
                        {ev.lat?.toFixed(3)}, {ev.lon?.toFixed(3)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDate(ev.posTimestamp)}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {formatDate(ev.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
