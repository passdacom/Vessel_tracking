import React, { useState, useEffect, useRef } from 'react';

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

export default function AddVesselModal({ onAdd, onClose, existingCount, customGroups = [], apiFetch }) {
  const [mode, setMode] = useState('search'); // 'search' | 'manual'
  const [mmsi, setMmsi] = useState('');
  const [alias, setAlias] = useState('');
  const [color, setColor] = useState(COLORS[existingCount % COLORS.length]);
  const [companyType, setCompanyType] = useState('자사간사');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchError('');

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/vessels/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          if (data.length === 0) setSearchError('검색 결과가 없습니다');
        } else {
          const err = await res.json();
          setSearchError(err.error || '검색 실패');
          setSearchResults([]);
        }
      } catch {
        setSearchError('네트워크 오류');
        setSearchResults([]);
      }
      setSearching(false);
    }, 500);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, apiFetch]);

  const handleSelectResult = (result) => {
    setSelectedResult(result);
    setMmsi(result.mmsi || '');
    setAlias(result.name || '');
  };

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
        className="bg-gray-800 rounded-2xl p-5 sm:p-6 w-[92vw] sm:w-[420px] max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">선박 추가</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 탭 전환 */}
        <div className="flex gap-1 mb-4 bg-gray-900 rounded-lg p-1">
          <button
            type="button"
            onClick={() => { setMode('search'); setError(''); }}
            className={`flex-1 py-2 text-sm rounded-md font-medium transition ${
              mode === 'search' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            🔍 검색으로 추가
          </button>
          <button
            type="button"
            onClick={() => { setMode('manual'); setError(''); setSelectedResult(null); }}
            className={`flex-1 py-2 text-sm rounded-md font-medium transition ${
              mode === 'manual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            ✏️ MMSI 직접 입력
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 검색 모드 */}
          {mode === 'search' && (
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-sm block mb-1.5">
                  선박명 / IMO / MMSI 검색
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedResult(null); }}
                  placeholder="예: EVER GIVEN, 9811000, 477123456"
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
                <p className="text-gray-500 text-[10px] mt-1">
                  선박명(2자 이상), IMO(7자리), MMSI(9자리) 입력 · 검색 시 API 크레딧 1 소모
                </p>
              </div>

              {/* 검색 결과 */}
              {searching && (
                <div className="text-center py-3 text-gray-400 text-sm">검색 중...</div>
              )}
              {searchError && !searching && (
                <div className="text-center py-2 text-gray-500 text-sm">{searchError}</div>
              )}
              {searchResults.length > 0 && !searching && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-700">
                  {searchResults.map((r, i) => {
                    const isSelected = selectedResult?.mmsi === r.mmsi;
                    return (
                      <button
                        key={`${r.mmsi}-${i}`}
                        type="button"
                        onClick={() => handleSelectResult(r)}
                        className={`w-full px-3 py-2.5 text-left transition ${
                          isSelected
                            ? 'bg-blue-900/50 border-l-2 border-l-blue-500'
                            : 'hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-white text-sm font-medium truncate">{r.name}</span>
                          {r.flag && <span className="text-gray-500 text-xs ml-2 flex-shrink-0">{r.flag}</span>}
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-gray-400">
                          {r.mmsi && <span>MMSI: <span className="font-mono text-gray-300">{r.mmsi}</span></span>}
                          {r.imo && <span>IMO: <span className="font-mono text-gray-300">{r.imo}</span></span>}
                        </div>
                        {r.type && <div className="text-[10px] text-gray-500 mt-0.5">{r.type}</div>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 선택된 선박 정보 */}
              {selectedResult && (
                <div className="bg-blue-950/30 border border-blue-800 rounded-lg px-3 py-2">
                  <div className="text-xs text-blue-400 mb-1">선택된 선박</div>
                  <div className="text-white text-sm font-medium">{selectedResult.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    MMSI: {selectedResult.mmsi}
                    {selectedResult.imo && ` · IMO: ${selectedResult.imo}`}
                    {selectedResult.type && ` · ${selectedResult.type}`}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 수동 입력 모드 */}
          {mode === 'manual' && (
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
          )}

          {/* 공통 필드: 별칭 */}
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
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{alias || `MMSI ${mmsi}`}</p>
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
