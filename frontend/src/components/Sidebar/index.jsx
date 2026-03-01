import React from 'react';
import VesselCard from './VesselCard.jsx';

const TRACK_OPTIONS = [
  { label: '1h', value: 1 },
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '7일', value: 168 },
  { label: '30일', value: 720 },
];

export default function Sidebar({
  vessels,
  positions,
  trackHours,
  onTrackHoursChange,
  onAddVessel,
  onDeleteVessel,
  onUpdateVessel,
  onSelectVessel,
  selectedVesselId,
  wsConnected,
}) {
  const activeCount = vessels.filter((v) => {
    const pos = positions[v.id]?.[0];
    return pos && Date.now() - new Date(pos.timestamp) < 2 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="w-72 h-full flex flex-col bg-gray-900 border-r border-gray-700 shadow-2xl flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚓</span>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Vessel Tracker</h1>
              <p className="text-gray-400 text-xs">
                {activeCount}/{vessels.length}척 활성
              </p>
            </div>
          </div>
          {/* WS connection indicator */}
          <div
            className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`}
            title={wsConnected ? '실시간 연결됨' : '연결 끊김'}
          />
        </div>

        <button
          onClick={onAddVessel}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          선박 추가
        </button>
      </div>

      {/* Track period selector */}
      <div className="px-3 py-2.5 border-b border-gray-700">
        <p className="text-gray-400 text-xs mb-2">항적 표시 기간</p>
        <div className="flex gap-1">
          {TRACK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onTrackHoursChange(opt.value)}
              className={`flex-1 py-1 text-xs rounded transition ${
                trackHours === opt.value
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vessel list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {vessels.length === 0 ? (
          <div className="text-center text-gray-500 mt-12 px-4">
            <p className="text-4xl mb-3">🚢</p>
            <p className="text-sm font-medium text-gray-400">등록된 선박이 없습니다</p>
            <p className="text-xs mt-1">위 버튼으로 선박을 추가하세요</p>
          </div>
        ) : (
          vessels.map((vessel) => (
            <VesselCard
              key={vessel.id}
              vessel={vessel}
              latestPosition={positions[vessel.id]?.[0]}
              isSelected={selectedVesselId === vessel.id}
              onSelect={() => onSelectVessel(vessel.id === selectedVesselId ? null : vessel.id)}
              onDelete={() => onDeleteVessel(vessel.id)}
              onUpdate={(updates) => onUpdateVessel(vessel.id, updates)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-700 text-center">
        <p className="text-gray-600 text-xs">AISStream.io 데이터</p>
      </div>
    </div>
  );
}
