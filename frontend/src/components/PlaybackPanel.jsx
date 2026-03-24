import React from "react";

// 재생 시간 옵션: 전체 트랙을 N초에 재생
const DURATION_OPTIONS = [
  { label: "10초", value: 10 },
  { label: "30초", value: 30 },
  { label: "1분", value: 60 },
  { label: "3분", value: 180 },
  { label: "5분", value: 300 },
];

function formatUTC(d) {
  const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mon}/${day} ${hh}:${mm}`;
}

function formatKST(d) {
  const kst = new Date(d.getTime() + 9 * 3600000);
  const mon = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mon}/${day} ${hh}:${mm}`;
}

function formatTimestamp(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  return `${formatUTC(d)} UTC`;
}

function formatTimestampFull(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return { utc: `${formatUTC(d)} UTC`, kst: `${formatKST(d)} KST` };
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "--";
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}일 ${hours % 24}시간`;
  if (hours > 0) return `${hours}시간`;
  const mins = Math.floor(ms / 60000);
  return `${mins}분`;
}

export default function PlaybackPanel({ vessel, playback, follow, onFollowToggle, onClose }) {
  const { playbackState, controls } = playback;
  const { isPlaying, playDuration, currentPosition, progress, elapsedPositions, totalDuration } = playbackState;

  if (!currentPosition) return null;

  const startTs = elapsedPositions.length > 0
    ? new Date(elapsedPositions[0].timestamp)
    : null;
  const endTs = playback.playbackPositions?.length > 0
    ? new Date(playback.playbackPositions[playback.playbackPositions.length - 1].timestamp)
    : null;

  const vesselName = vessel?.name || vessel?.alias || vessel?.mmsi || "Unknown";
  const color = vessel?.color || "#3b82f6";
  const posCount = playback.playbackPositions?.length || 0;

  const ts = formatTimestampFull(currentPosition.timestamp);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1100] bg-gray-900/95 text-white border-t border-gray-700 backdrop-blur-sm">
      {/* 상단: 선박명 + 닫기 */}
      <div className="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-sm truncate">{vesselName}</span>
          <span className="text-xs text-gray-400 hidden sm:inline">항적 재생</span>
          <span className="text-xs text-gray-500 hidden sm:inline">
            ({formatDuration(totalDuration)} / {posCount}개 위치)
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg px-2 flex-shrink-0"
          title="재생 종료"
        >
          ✕
        </button>
      </div>

      {/* 타임라인 슬라이더 */}
      <div className="px-3 sm:px-4 py-1">
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-400">
          <span className="w-20 sm:w-24 text-right text-[10px] sm:text-xs">{startTs ? formatTimestamp(startTs) : "--"}</span>
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(progress * 1000)}
            onChange={(e) => controls.seek(parseInt(e.target.value) / 1000)}
            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
          />
          <span className="w-20 sm:w-24 text-[10px] sm:text-xs">{endTs ? formatTimestamp(endTs) : "--"}</span>
        </div>
      </div>

      {/* 컨트롤 행 - 모바일: 2줄, 데스크탑: 1줄 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 pb-2 sm:pb-3 pt-1 gap-1.5 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 재생/일시정지 */}
          <button
            onClick={controls.togglePlay}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-base sm:text-lg flex-shrink-0"
            title={isPlaying ? "일시정지" : "재생"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* 재생 시간 선택 */}
          <div className="flex gap-0.5 sm:gap-1">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => controls.setPlayDuration(opt.value)}
                className={`px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs rounded ${
                  playDuration === opt.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
                title={`전체 항적을 ${opt.label}에 재생`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 팔로우 토글 */}
          <button
            onClick={onFollowToggle}
            className={`px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs rounded flex items-center gap-1 flex-shrink-0 ${
              follow
                ? "bg-green-700 text-green-200"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
            title={follow ? "자동 추적 ON" : "자동 추적 OFF"}
          >
            <span>{follow ? "📍" : "🔓"}</span>
            {follow ? "Follow" : "Free"}
          </button>
        </div>

        {/* 현재 위치 정보 - 모바일: 축약 표시 */}
        <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-gray-300 overflow-x-auto">
          <span className="font-mono whitespace-nowrap">
            <span className="text-blue-300">{ts?.utc || "--"}</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className="text-yellow-300">{ts?.kst || "--"}</span>
          </span>
          <span className="whitespace-nowrap">
            SOG: <span className="font-mono">{currentPosition.sog != null ? currentPosition.sog.toFixed(1) : "--"}</span>kn
          </span>
          <span className="whitespace-nowrap">
            HDG: <span className="font-mono">{currentPosition.heading != null ? Math.round(currentPosition.heading) : "--"}</span>&deg;
          </span>
          <span className="text-gray-500 font-mono text-[10px] whitespace-nowrap hidden sm:inline">
            {currentPosition.lat.toFixed(4)}, {currentPosition.lon.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
