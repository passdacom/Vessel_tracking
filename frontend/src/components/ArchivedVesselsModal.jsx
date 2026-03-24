import React from "react";

function lastSeenText(timestamp) {
    if (!timestamp) return null;
    const d = new Date(timestamp);
    if (isNaN(d)) return null;
    return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function ArchivedVesselsModal({ vessels, onRestore, onDelete, onClose }) {
    const archived = vessels.filter(v => v.active === false);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <h2 className="text-white font-bold text-sm">보관함</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition text-lg leading-none">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {archived.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-8">보관된 선박이 없습니다</p>
                    ) : (
                        archived.map(v => {
                            const latestPos = v.positions?.[0];
                            const lastSeen = latestPos ? lastSeenText(latestPos.timestamp) : null;
                            const displayName = v.alias || v.name || v.mmsi;

                            return (
                                <div key={v.id} className="bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-700">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-500" style={{ backgroundColor: v.color }} />
                                        <span className="text-white text-sm font-semibold truncate flex-1">{displayName}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mb-2 pl-4 space-y-0.5">
                                        <div>MMSI: <span className="text-gray-400 font-mono">{v.mmsi}</span></div>
                                        {lastSeen && <div>마지막 신호: <span className="text-gray-400">{lastSeen}</span></div>}
                                        {!lastSeen && <div className="text-gray-600">위치 기록 없음</div>}
                                    </div>
                                    <div className="flex gap-2 pl-4">
                                        <button
                                            onClick={() => onRestore(v.id)}
                                            className="flex-1 py-1 bg-blue-700 hover:bg-blue-600 text-white text-xs rounded transition"
                                        >
                                            복원
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`"${displayName}"을 완전히 삭제하시겠습니까?\n위치 기록도 모두 삭제됩니다.`))
                                                    onDelete(v.id);
                                            }}
                                            className="flex-1 py-1 bg-gray-700 hover:bg-red-700 text-gray-400 hover:text-white text-xs rounded transition"
                                        >
                                            완전삭제
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
