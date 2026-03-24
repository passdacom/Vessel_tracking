import React, { useState, useEffect } from 'react';

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

export default function AddVesselModal({ onAdd, onClose, existingCount, customGroups = [] }) {
  const [mmsi, setMmsi] = useState('');
  const [alias, setAlias] = useState('');
  const [color, setColor] = useState(COLORS[existingCount % COLORS.length]);
  const [companyType, setCompanyType] = useState('자사간사');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const err = await onAdd(mmsi.trim(), alias.trim() || null, color, companyType);
    if (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000]"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-2xl p-6 w-96 shadow-2xl border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">선박 추가</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm block mb-1.5">
              MMSI <span className="text-red-400">*</span>
              <span className="text-gray-500 text-xs ml-1">(9자리 선박 식별 번호)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={mmsi}
              onChange={(e) => setMmsi(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="예: 440123456"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none font-mono tracking-widest"
              required
              autoFocus
            />
            {mmsi.length > 0 && mmsi.length < 9 && (
              <p className="text-yellow-400 text-xs mt-1">{9 - mmsi.length}자리 더 입력 필요</p>
            )}
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-1.5">
              별칭 <span className="text-gray-500 text-xs">(선택)</span>
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="예: 1호선, 화물선A"
              className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* 소속 그룹 선택 */}
          <div>
            <label className="text-gray-400 text-sm block mb-2">소속 그룹</label>
            <div className="flex flex-wrap gap-2">
              {['자사간사', '타사간사', ...customGroups].map((type) => {
                const isActive = companyType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCompanyType(type)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                      isActive
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-sm block mb-2">지도 표시 색상</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? '3px solid white' : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          {mmsi.length === 9 && (
            <div
              className="flex items-center gap-3 p-3 rounded-lg border"
              style={{ borderColor: color, backgroundColor: color + '18' }}
            >
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{alias || `MMSI ${mmsi}`}</p>
                <p className="text-gray-400 text-xs">MMSI: {mmsi} · {companyType}</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || mmsi.length !== 9}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
            >
              {loading ? '추가 중...' : '추가하기'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
            >
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
