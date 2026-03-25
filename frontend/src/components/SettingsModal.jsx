import React, { useState } from "react";

export default function SettingsModal({ apiFetch, accountName, onClose, onLogout }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPw.length < 4) { setError("새 비밀번호는 4자 이상이어야 합니다"); return; }
    if (newPw !== confirmPw) { setError("새 비밀번호가 일치하지 않습니다"); return; }

    setLoading(true);
    try {
      const res = await apiFetch("/account/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: newPw }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("비밀번호가 변경되었습니다. 다시 로그인해주세요.");
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
        // 3초 후 로그아웃
        setTimeout(() => onLogout(), 2000);
      } else {
        setError(data.error || "변경 실패");
      }
    } catch {
      setError("네트워크 오류");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl p-6 w-[92vw] sm:w-[380px] shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">설정</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 계정 정보 */}
        <div className="bg-gray-900 rounded-lg px-4 py-3 mb-5">
          <div className="text-xs text-gray-500 mb-1">현재 계정</div>
          <div className="text-white font-semibold">{accountName?.toUpperCase()}</div>
        </div>

        {/* 비밀번호 변경 */}
        <form onSubmit={handleChangePassword} className="space-y-3">
          <h3 className="text-gray-300 text-sm font-semibold">비밀번호 변경</h3>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="새 비밀번호"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
          />
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="새 비밀번호 확인"
            className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none text-sm"
          />

          {error && <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded px-3 py-2">{error}</p>}
          {message && <p className="text-green-400 text-sm bg-green-950 border border-green-800 rounded px-3 py-2">{message}</p>}

          <button
            type="submit"
            disabled={loading || !newPw}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition text-sm"
          >
            {loading ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>

        {/* 로그아웃 */}
        <div className="mt-5 pt-4 border-t border-gray-700">
          <button
            onClick={onLogout}
            className="w-full py-2.5 bg-gray-700 hover:bg-red-800 text-gray-300 hover:text-white font-semibold rounded-lg transition text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
