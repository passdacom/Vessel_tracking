import React, { useState } from 'react';
import { COMPANY_ACCOUNTS, getRememberedCompany, rememberCompany } from '../loginAccounts.js';

export default function LoginPage({ onLogin }) {
  const [account, setAccount] = useState(() => getRememberedCompany());
  const [adminMode, setAdminMode] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const submittedAccount = adminMode ? 'admin' : account;

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: submittedAccount, password }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!adminMode) rememberCompany(undefined, submittedAccount);
        onLogin(data.account, data.role, data.token);
      } else {
        setError('소속 회사 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    }

    setLoading(false);
  };

  const toggleAdminMode = () => {
    setAdminMode((current) => !current);
    setError('');
    setPassword('');
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="bg-gray-800 rounded-2xl p-8 w-80 shadow-2xl border border-gray-700">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚓</div>
          <h1 className="text-2xl font-bold text-white">Vessel Tracker</h1>
          <p className="text-gray-400 text-sm mt-1">선박 모니터링 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {adminMode ? (
            <div className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-sm text-white">
              관리자 로그인
            </div>
          ) : (
            <div>
              <label htmlFor="account" className="text-gray-400 text-xs block mb-1">소속 회사</label>
              <select
                id="account"
                name="account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="">회사를 선택하세요</option>
                {COMPANY_ACCOUNTS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="password" className="text-gray-400 text-xs block mb-1">비밀번호</label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              autoComplete="current-password"
              className="w-full px-4 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-500"
            />
          </div>

          {error && (
            <p role="alert" aria-live="polite" className="text-red-400 text-sm bg-red-950 border border-red-800 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition"
          >
            {loading ? '확인 중...' : '로그인'}
          </button>

          <button
            type="button"
            onClick={toggleAdminMode}
            className="w-full text-xs text-gray-400 hover:text-gray-200"
          >
            {adminMode ? '회사 로그인으로 돌아가기' : '관리자 로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
