import React, { useState, useEffect, useRef } from 'react';

const AUTH_KEY = 'api_modal_auth_ts';   // localStorage 키
const SESSION_TTL = 60 * 60 * 1000;    // 1시간 (ms)

/** 인증 시각 저장 */
function saveAuthTime() {
    localStorage.setItem(AUTH_KEY, Date.now().toString());
}

/** 인증이 아직 유효한지 확인 */
function isAuthValid() {
    const ts = parseInt(localStorage.getItem(AUTH_KEY) || '0', 10);
    return ts > 0 && (Date.now() - ts) < SESSION_TTL;
}

/**
 * API 수동 강제 수신 모달
 * - 비밀번호 인증 (880715) — 1시간 세션 유지
 * - 전체 선박 또는 선택 선박만 갱신
 * - 실행 로그 터미널 뷰어
 */
export default function ApiUpdateModal({ onClose, apiFetch, vessels = [] }) {
    const [password, setPassword] = useState('');
    // 모달 열릴 때 localStorage 세션 유효성 확인 → 유효하면 'ready' 상태로 시작
    const [step, setStep] = useState(() => isAuthValid() ? 'ready' : 'auth');
    const [logs, setLogs] = useState([]);
    const [errorMsg, setErrorMsg] = useState(null);
    const [selectedMmsis, setSelectedMmsis] = useState(new Set());
    const [updateMode, setUpdateMode] = useState('all');

    const bottomRef = useRef(null);

    // 1분마다 세션 만료 체크 (모달 열린 상태에서 시간 경과 시 자동 로그아웃)
    useEffect(() => {
        const timer = setInterval(() => {
            if (step !== 'auth' && !isAuthValid()) {
                setStep('auth');
                setLogs([]);
            }
        }, 60_000);
        return () => clearInterval(timer);
    }, [step]);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const toggleMmsi = (mmsi) => {
        setSelectedMmsis(prev => {
            const next = new Set(prev);
            if (next.has(mmsi)) next.delete(mmsi);
            else next.add(mmsi);
            return next;
        });
    };

    const handleStartUpdate = async (e) => {
        e.preventDefault();
        setErrorMsg(null);

        // apiFetch 유효성 검사
        if (typeof apiFetch !== 'function') {
            setErrorMsg('시스템 오류: apiFetch가 초기화되지 않았습니다. 페이지를 새로고침 해주세요.');
            return;
        }

        // 비밀번호 검증 (auth 단계에서만)
        if (step === 'auth') {
            if (password !== '880715') {
                setErrorMsg('비밀번호가 올바르지 않습니다.');
                setPassword('');
                return;
            }
            // 인증 성공 → 시각 저장 (1시간 세션)
            saveAuthTime();
        }

        setStep('running');
        setLogs([]);

        const mmsiList = updateMode === 'selected' && selectedMmsis.size > 0
            ? [...selectedMmsis]
            : null; // null = 전체

        const targetDesc = mmsiList
            ? `선택 선박 ${mmsiList.length}척 (MMSI: ${mmsiList.join(', ')})`
            : `전체 선박 ${vessels.length}척`;

        setLogs(prev => [...prev, `> 대상: ${targetDesc}`, '> 서버에 강제 업데이트를 요청하는 중...']);

        try {
            const body = { password };
            if (mmsiList) body.mmsiList = mmsiList;

            const res = await apiFetch('/force-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || '업데이트에 실패했습니다.');
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;
            let buffer = '';
            
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // keep the last incomplete line
                    if (lines.length > 0) {
                        const validLines = lines.filter(l => l.trim().length > 0);
                        if (validLines.length > 0) {
                            setLogs(prev => [...prev, ...validLines]);
                        }
                    }
                }
            }
            if (buffer.trim().length > 0) {
                setLogs(prev => [...prev, buffer.trim()]);
            }

            setLogs(prev => [...prev, '> ✅ 업데이트 완료']);
            setStep('done');
        } catch (err) {
            setErrorMsg(err.message);
            setLogs(prev => [...prev, `> ❌ 치명적 오류: ${err.message}`]);
            setStep('error');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[90vh]">

                {/* 모달 헤더 (터미널 윈도우 스타일) */}
                <div className="bg-gray-800 border-b border-gray-700 p-3 flex justify-between items-center shrink-0">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500 cursor-pointer hover:bg-red-400" onClick={onClose} />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <h3 className="text-gray-400 text-sm font-mono font-medium">~/vessel-tracking/api-updater</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition group">
                        <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 모달 콘텐츠 */}
                <div className="p-5 flex-1 flex flex-col overflow-hidden">

                    {/* 1. 인증 단계 */}
                    {step === 'auth' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <h4 className="text-white text-base font-bold mb-1 text-center">API 즉시 수신 (Datalastic)</h4>
                            <p className="text-gray-400 text-xs text-center mb-4">
                                이 작업은 API 크레딧을 소진합니다. 관리자 비밀번호를 입력해주세요.
                            </p>

                            {/* 갱신 대상 선택 */}
                            {vessels.length > 0 && (
                                <div className="mb-4">
                                    <div className="flex gap-2 mb-3">
                                        <button
                                            type="button"
                                            onClick={() => setUpdateMode('all')}
                                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${updateMode === 'all' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                        >
                                            🔄 전체 갱신 ({vessels.length}척)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setUpdateMode('selected')}
                                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${updateMode === 'selected' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                        >
                                            ☑️ 선박 선택 갱신
                                        </button>
                                    </div>

                                    {/* 선박 선택 목록 */}
                                    {updateMode === 'selected' && (
                                        <div className="bg-gray-950 border border-gray-700 rounded-lg overflow-y-auto max-h-40 p-2 space-y-1 mb-3">
                                            {vessels.map(v => (
                                                <label key={v.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-800 cursor-pointer transition">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedMmsis.has(v.mmsi)}
                                                        onChange={() => toggleMmsi(v.mmsi)}
                                                        className="w-3.5 h-3.5 rounded accent-blue-500"
                                                    />
                                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: v.color || '#6b7280' }} />
                                                    <span className="text-white text-xs font-medium flex-1 truncate">
                                                        {v.alias || v.name || v.mmsi}
                                                    </span>
                                                    <span className="text-gray-500 text-[10px] font-mono">{v.mmsi}</span>
                                                </label>
                                            ))}
                                            <div className="pt-1 border-t border-gray-800 text-right">
                                                <span className="text-gray-500 text-[10px]">{selectedMmsis.size}척 선택됨</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 비밀번호 입력 */}
                            <form onSubmit={handleStartUpdate} className="space-y-3 mt-auto">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="비밀번호 입력..."
                                    className="w-full bg-gray-950 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition font-mono tracking-widest text-center"
                                    autoFocus
                                />
                                {errorMsg && (
                                    <p className="text-red-400 text-sm text-center font-medium animate-pulse">{errorMsg}</p>
                                )}
                                <button
                                    type="submit"
                                    disabled={!password || (updateMode === 'selected' && selectedMmsis.size === 0)}
                                    className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition"
                                >
                                    {updateMode === 'selected' && selectedMmsis.size > 0
                                        ? `선택 ${selectedMmsis.size}척 강제 갱신`
                                        : '전체 강제 갱신 실행'
                                    }
                                </button>
                            </form>
                        </div>
                    )}

                    {/* 2. 실행 로그 뷰어 단계 */}
                    {step !== 'auth' && (
                        <div className="flex-1 bg-black rounded-lg border border-gray-800 p-4 font-mono text-sm overflow-hidden flex flex-col shadow-inner">
                            <div className="flex-1 overflow-y-auto pr-2">
                                <div className="text-green-500 opacity-70 mb-4 whitespace-pre text-[10px] leading-tight">{`   _____       __        __           __  _     
  /  _  \\     |__|____ _/  |______   |  |(_)___ 
 /  /_\\  \\_   |  \\__  \\\\   __\\__  \\  |  |  |  \\
/    |    \\   |  |/ __ \\|  |  / __ \\_|  |  |  /
\\____|__  /___|  (____  /__| (____  /|__|__|_ \\
        \\/\\_____/     \\/          \\/         \\/
`}</div>
                                <div className="space-y-1.5 text-gray-300">
                                    {logs.map((log, index) => {
                                        let colorClass = "text-gray-300";
                                        if (log.includes("✅")) colorClass = "text-green-400 font-bold";
                                        if (log.includes("❌") || log.includes("⚠") || log.toLowerCase().includes("error")) colorClass = "text-red-400 font-bold";
                                        if (log.includes("▶") || log.includes("📡")) colorClass = "text-blue-400 font-bold";
                                        if (log.includes("⏩")) colorClass = "text-yellow-400";
                                        return (
                                            <div key={index} className={`font-mono ${colorClass} break-all text-xs`}>
                                                {log}
                                            </div>
                                        );
                                    })}
                                    <div ref={bottomRef} className="h-1" />
                                </div>
                                {step === 'running' && (
                                    <div className="mt-2 text-green-500 animate-pulse font-bold">_</div>
                                )}
                            </div>

                            {(step === 'done' || step === 'error') && (
                                <div className="mt-4 pt-4 border-t border-gray-800 flex justify-end shrink-0">
                                    <button
                                        onClick={onClose}
                                        className="bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded transition border border-gray-600"
                                    >
                                        터미널 닫기 (새로고침)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
