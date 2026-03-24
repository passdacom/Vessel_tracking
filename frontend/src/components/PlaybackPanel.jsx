import React from "react";

const SPEEDS = [1, 2, 5, 10, 50];

function formatTimestamp(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${mon}/${day} ${hh}:${mm}`;
}

export default function PlaybackPanel({ vessel, playback, follow, onFollowToggle, onClose }) {
  const { playbackState, controls } = playback;
  const { isPlaying, speed, currentPosition, progress, elapsedPositions, totalDuration } = playbackState;

  if (!currentPosition) return null;

  const startTs = elapsedPositions.length > 0
    ? new Date(elapsedPositions[0].timestamp)
    : null;
  const endTs = playback.playbackPositions?.length > 0
    ? new Date(playback.playbackPositions[playback.playbackPositions.length - 1].timestamp)
    : null;

  const vesselName = vessel?.name || vessel?.alias || vessel?.mmsi || "Unknown";
  const color = vessel?.color || "#3b82f6";

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-gray-900/95 text-white border-t border-gray-700 backdrop-blur-sm">
      {/* 상단: 선박명 + 닫기 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-semibold text-sm">{vesselName}</span>
          <span className="text-xs text-gray-400">항적 재생</span>
          {totalDuration > 0 && (
            <span className="text-xs text-gray-500 ml-2">
              ({Math.round(totalDuration / 3600000)}시간 분량)
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg px-2"
          title="재생 종료"
        >
          ✕
        </button>
      </div>

      {/* 타임라인 슬라이더 */}
      <div className="px-4 py-1">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{startTs ? formatTimestamp(startTs) : "--"}</span>
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(progress * 1000)}
            onChange={(e) => controls.seek(parseInt(e.target.value) / 1000)}
            className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
          />
          <span>{endTs ? formatTimestamp(endTs) : "--"}</span>
        </div>
      </div>

      {/* 컨트롤 행 */}
      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        <div className="flex items-center gap-3">
          {/* 재생/일시정지 */}
          <button
            onClick={controls.togglePlay}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-lg"
            title={isPlaying ? "일시정지" : "재생"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* 속도 선택 */}
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => controls.setSpeed(s)}
                className={`px-2 py-1 text-xs rounded ${
                  speed === s
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* 팔로우 토글 */}
          <button
            onClick={onFollowToggle}
            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
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

        {/* 현재 위치 정보 */}
        <div className="flex items-center gap-4 text-xs text-gray-300">
          <span className="text-blue-300 font-mono">
            {formatTimestamp(currentPosition.timestamp)}
          </span>
          <span>
            SOG: <span className="font-mono">{currentPosition.sog != null ? currentPosition.sog.toFixed(1) : "--"}</span>kn
          </span>
          <span>
            HDG: <span className="font-mono">{currentPosition.heading != null ? Math.round(currentPosition.heading) : "--"}</span>&deg;
          </span>
          <span className="text-gray-500 font-mono text-[11px]">
            {currentPosition.lat.toFixed(4)}, {currentPosition.lon.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}
