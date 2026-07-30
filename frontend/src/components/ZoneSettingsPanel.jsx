import React from "react";
import AreaPanel from "../riskAreas/AreaPanel.jsx";

export default function ZoneSettingsPanel({ zoneSettings, onUpdate, onClose, onFocusArea }) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-[94vw] max-w-[440px] flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Risk area display settings"
      >
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Risk Area 표시 설정</h3>
            <p className="text-[10px] text-gray-500">Current reference layers · 계약 경보와 별도</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-lg text-gray-400 hover:text-white"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <AreaPanel
            zoneSettings={zoneSettings}
            onUpdate={onUpdate}
            onFocusArea={onFocusArea}
            showAppearance
          />
        </div>
      </div>
    </div>
  );
}
