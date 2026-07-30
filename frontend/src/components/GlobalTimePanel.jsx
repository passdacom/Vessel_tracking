import { useState, useMemo, useCallback } from "react";

// ── 시간 포맷 헬퍼 ──────────────────────────────────────────────
function formatKST(d) {
    if (!d) return "--";
    const kst = new Date(d.getTime() + 9 * 3600000);
    const mon = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    const hh  = String(kst.getUTCHours()).padStart(2, "0");
    const mm  = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${mon}/${day} ${hh}:${mm} KST`;
}

function formatUTC(d) {
    if (!d) return "--";
    const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh  = String(d.getUTCHours()).padStart(2, "0");
    const mm  = String(d.getUTCMinutes()).padStart(2, "0");
    return `${mon}/${day} ${hh}:${mm} UTC`;
}

// Date → datetime-local input 값 (로컬 타임존)
function toLocalInput(date) {
    if (!date) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// datetime-local input → Date (로컬 타임존 기준)
function fromLocalInput(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────
export default function GlobalTimePanel({ globalTime, onSetGlobalTime, positions }) {
    const [open, setOpen] = useState(false);

    // 전체 위치 데이터에서 시간 범위 계산
    const { dataMin, dataMax } = useMemo(() => {
        let min = null, max = null;
        for (const posArray of Object.values(positions)) {
            for (const p of posArray) {
                const t = new Date(p.timestamp);
                if (!min || t < min) min = t;
                if (!max || t > max) max = t;
            }
        }
        return { dataMin: min, dataMax: max };
    }, [positions]);

    // 슬라이더 범위: 기본은 전체 데이터 범위, 커스텀 입력으로 조정 가능
    const [rangeStart, setRangeStart] = useState(null); // null = dataMin 사용
    const [rangeEnd,   setRangeEnd]   = useState(null); // null = dataMax 사용

    const sliderMin = rangeStart || dataMin;
    const sliderMax = rangeEnd   || dataMax;

    const hasRange = sliderMin && sliderMax && sliderMax > sliderMin;

    // progress (0~1000) ↔ Date 변환
    const dateToProgress = useCallback((date) => {
        if (!hasRange || !date) return 0;
        const ratio = (date.getTime() - sliderMin.getTime()) / (sliderMax.getTime() - sliderMin.getTime());
        return Math.round(Math.max(0, Math.min(1, ratio)) * 1000);
    }, [hasRange, sliderMin, sliderMax]);

    const progressToDate = useCallback((progress) => {
        if (!hasRange) return null;
        return new Date(sliderMin.getTime() + (progress / 1000) * (sliderMax.getTime() - sliderMin.getTime()));
    }, [hasRange, sliderMin, sliderMax]);

    const currentProgress = globalTime ? dateToProgress(globalTime) : 0;

    const handleSliderChange = (e) => {
        const date = progressToDate(parseInt(e.target.value));
        if (date) onSetGlobalTime(date);
    };

    const handleOpen = () => {
        if (!globalTime && dataMax) onSetGlobalTime(dataMax);
        setOpen(true);
    };

    const handleClose = () => {
        onSetGlobalTime(null);
        setRangeStart(null);
        setRangeEnd(null);
        setOpen(false);
    };

    // 패널이 열려 있을 때 (슬라이더 UI)
    if (open) {
        return (
            <div className="absolute bottom-0 left-0 right-0 z-[1100] bg-gray-900/95 text-white border-t border-gray-700 backdrop-blur-sm">
                {/* 헤더 */}
                <div className="flex items-center justify-between px-3 sm:px-4 pt-2 pb-1">
                    <div className="flex items-center gap-2">
                        <span className="text-base">🕐</span>
                        <span className="font-semibold text-sm">전체 시간 이동</span>
                        <span className="text-xs text-gray-400 hidden sm:inline">— 모든 선박을 선택한 시각으로 이동</span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white text-lg px-2 flex-shrink-0"
                        title="시간 이동 종료"
                    >✕</button>
                </div>

                {/* 슬라이더 */}
                <div className="px-3 sm:px-4 py-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-400">
                        <span className="w-24 sm:w-28 text-right text-[10px] sm:text-xs shrink-0">
                            {sliderMin ? formatUTC(sliderMin) : "--"}
                        </span>
                        <input
                            type="range"
                            min="0"
                            max="1000"
                            value={currentProgress}
                            onChange={handleSliderChange}
                            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                            disabled={!hasRange}
                        />
                        <span className="w-24 sm:w-28 text-[10px] sm:text-xs shrink-0">
                            {sliderMax ? formatUTC(sliderMax) : "--"}
                        </span>
                    </div>
                </div>

                {/* 현재 선택 시각 + 범위 조정 */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 pb-2 sm:pb-3 pt-0.5 gap-2 sm:gap-0">
                    {/* 현재 시각 표시 */}
                    <div className="flex items-center gap-3 text-xs">
                        <span className="font-semibold text-blue-300">{formatUTC(globalTime)}</span>
                        <span className="text-yellow-300">{formatKST(globalTime)}</span>
                    </div>

                    {/* 범위 조정 (접기/펼치기) */}
                    <RangeInputs
                        dataMin={dataMin}
                        dataMax={dataMax}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        onChangeStart={(v) => setRangeStart(fromLocalInput(v))}
                        onChangeEnd={(v) => setRangeEnd(fromLocalInput(v))}
                        onReset={() => { setRangeStart(null); setRangeEnd(null); }}
                    />
                </div>
            </div>
        );
    }

    // 비활성 상태: 플로팅 버튼
    return (
        <button
            onClick={handleOpen}
            style={{
                position: "absolute", bottom: 80, right: 12,
                zIndex: 1000,
                background: "#1f2937", color: "#d1d5db",
                border: "1px solid #374151", borderRadius: 8,
                padding: "7px 12px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
            title="특정 시각으로 모든 선박 위치 이동"
        >
            🕐 시간 이동
        </button>
    );
}

// ── 범위 조정 서브컴포넌트 ────────────────────────────────────────
function RangeInputs({ dataMin, dataMax, rangeStart, rangeEnd, onChangeStart, onChangeEnd, onReset }) {
    const [expanded, setExpanded] = useState(false);

    if (!expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                className="text-[10px] sm:text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
            >
                범위 조정
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400">시작</span>
            <input
                type="datetime-local"
                defaultValue={toLocalInput(rangeStart || dataMin)}
                onChange={(e) => onChangeStart(e.target.value)}
                className="bg-gray-800 text-gray-200 text-[10px] border border-gray-600 rounded px-1 py-0.5"
                style={{ width: 140 }}
            />
            <span className="text-[10px] text-gray-400">종료</span>
            <input
                type="datetime-local"
                defaultValue={toLocalInput(rangeEnd || dataMax)}
                onChange={(e) => onChangeEnd(e.target.value)}
                className="bg-gray-800 text-gray-200 text-[10px] border border-gray-600 rounded px-1 py-0.5"
                style={{ width: 140 }}
            />
            <button
                onClick={() => { onReset(); setExpanded(false); }}
                className="text-[10px] text-gray-500 hover:text-gray-300 underline underline-offset-2"
            >초기화</button>
        </div>
    );
}
