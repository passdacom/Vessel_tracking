import React, { useState, useEffect, useRef } from 'react';

export default function ApiUpdateModal({ onClose, apiFetch }) {
    const [password, setPassword] = useState('');
    const [step, setStep] = useState('auth'); // auth | running | done | error
    const [logs, setLogs] = useState([]);
    const [errorMsg, setErrorMsg] = useState(null);

    const bottomRef = useRef(null);

    // 로그가 추가될 때마다 스크롤을 맨 아래로 이동
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const handleStartUpdate = async (e) => {
        e.preventDefault();
        setErrorMsg(null);
        setStep('running');
        setLogs((prev) => [...prev, '> 서버에 강제 업데이트를 요청하는 중...']);

        try {
            const res = await apiFetch('/force-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || '업데이트에 실패했습니다.');
            }

            setLogs((prev) => [...prev, ...data.logs, '> ✅ 업데이트 완료']);
            setStep('done');
        } catch (err) {
            setErrorMsg(err.message);
            setLogs((prev) => [...prev, `> ❌ 치명적 오류: ${err.message}`]);
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
                <div className="p-6 flex-1 flex flex-col overflow-hidden">

                    {/* 1. 인증 단계 */}
                    {step === 'auth' && (
                        <div className="flex-1 flex flex-col justify-center items-center">
                            <div className="w-full max-w-sm">
                                <h4 className="text-white text-lg font-bold mb-2 text-center">API 즉시 수신 (Datalastic)</h4>
                                <p className="text-gray-400 text-sm text-center mb-6">
                                    이 작업은 API 크레딧을 강제로 소진합니다.<br />관리자 비밀번호를 입력해주세요.
                                </p>
                                <form onSubmit={handleStartUpdate} className="space-y-4">
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
                                        disabled={!password}
                                        className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition"
                                    >
                                        강제 업데이트 실행
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* 2. 실행 로그 뷰어 단계 */}
                    {step !== 'auth' && (
                        <div className="flex-1 bg-black rounded-lg border border-gray-800 p-4 font-mono text-sm overflow-hidden flex flex-col relative shadow-inner">

                            {/* 로그 터미널 창 */}
                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                <div className="text-green-500 opacity-70 mb-4 whitespace-pre">
                                    {`   _____       __        __           __  _     
  /  _  \\     |__|____ _/  |______   |  |(_)___ 
 /  /_\\  \\_   |  \\__  \\\\   __\\__  \\  |  |  |  \\
/    |    \\   |  |/ __ \\|  |  / __ \\_|  |  |  /
\\____|__  /___|  (____  /__| (____  /|__|__|_ \\
        \\/\\_____/     \\/          \\/         \\/
`}
                                </div>
                                <div className="space-y-1.5 text-gray-300">
                                    {logs.map((log, index) => {
                                        // 로그 내용에 따른 색상 구분
                                        let colorClass = "text-gray-300";
                                        if (log.includes("✅")) colorClass = "text-green-400 font-bold";
                                        if (log.includes("❌") || log.includes("⚠") || log.toLowerCase().includes("error")) colorClass = "text-red-400 font-bold";
                                        if (log.includes("▶") || log.includes("📡")) colorClass = "text-blue-400 font-bold";
                                        if (log.includes("⏩")) colorClass = "text-yellow-400";

                                        return (
                                            <div key={index} className={`font-mono ${colorClass} break-all`}>
                                                {log}
                                            </div>
                                        );
                                    })}
                                    <div ref={bottomRef} className="h-1" />
                                </div>

                                {/* 실행 중일 때 깜빡이는 커서 */}
                                {step === 'running' && (
                                    <div className="mt-2 text-green-500 animate-pulse font-bold">_</div>
                                )}
                            </div>

                            {/* 하단 닫기 컨트롤 */}
                            {(step === 'done' || step === 'error') && (
                                <div className="mt-4 pt-4 border-t border-gray-800 flex justify-end shrink-0">
                                    <button
                                        onClick={onClose}
                                        className="bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-6 rounded transition border border-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                    >
                                        터미널 닫기 (새로고침)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
