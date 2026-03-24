import React from "react";

// 전체 해역 목록 (GeoJSON feature name → 표시용 짧은 이름)
const ZONE_LIST = [
  { key: "JWC War Risk Zone - Persian Gulf", label: "Persian Gulf", group: "war" },
  { key: "JWC War Risk Zone - Gulf of Oman", label: "Gulf of Oman", group: "war" },
  { key: "JWC War Risk Zone - Gulf of Aden", label: "Gulf of Aden", group: "war" },
  { key: "JWC War Risk Zone - Red Sea (S of 18N)", label: "Red Sea (S of 18N)", group: "war" },
  { key: "JWC War Risk Zone - Arabian Sea (JWC West)", label: "Arabian Sea", group: "war" },
  { key: "JWC War Risk Zone - Indian Ocean (JWC North-West)", label: "Indian Ocean (NW)", group: "war" },
  { key: "Saudi Arabia 12NM Territorial Waters (Red Sea)", label: "Saudi Arabia 12NM", group: "territorial" },
  { key: "Israel 12NM Territorial Waters", label: "Israel 12NM", group: "territorial" },
  { key: "Lebanon 12NM Territorial Waters", label: "Lebanon 12NM", group: "territorial" },
];

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

const DEFAULT_ZONE = { visible: true, color: "#ef4444", opacity: 0.15 };

export { ZONE_LIST, DEFAULT_ZONE };

export default function ZoneSettingsPanel({ zoneSettings, onUpdate, onClose }) {
  const getSetting = (key) => ({ ...DEFAULT_ZONE, ...zoneSettings[key] });

  const update = (key, patch) => {
    onUpdate({ ...zoneSettings, [key]: { ...getSetting(key), ...patch } });
  };

  const allVisible = ZONE_LIST.every((z) => getSetting(z.key).visible);
  const noneVisible = ZONE_LIST.every((z) => !getSetting(z.key).visible);

  const toggleAll = (visible) => {
    const next = { ...zoneSettings };
    ZONE_LIST.forEach((z) => {
      next[z.key] = { ...getSetting(z.key), visible };
    });
    onUpdate(next);
  };

  const setAllOpacity = (opacity) => {
    const next = { ...zoneSettings };
    ZONE_LIST.forEach((z) => {
      next[z.key] = { ...getSetting(z.key), opacity };
    });
    onUpdate(next);
  };

  const warZones = ZONE_LIST.filter((z) => z.group === "war");
  const territorialZones = ZONE_LIST.filter((z) => z.group === "territorial");

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[92vw] sm:w-[340px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-white text-sm font-semibold">War Risk Zone 설정</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg px-1">✕</button>
        </div>

        {/* 전체 제어 */}
        <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
          <button
            onClick={() => toggleAll(!allVisible)}
            className={`px-2.5 py-1 text-xs rounded transition ${
              allVisible ? "bg-red-700 text-white" : noneVisible ? "bg-gray-700 text-gray-400" : "bg-gray-600 text-gray-300"
            }`}
          >
            {allVisible ? "전체 숨기기" : "전체 표시"}
          </button>
          <span className="text-gray-500 text-[10px] ml-1">전체 투명도</span>
          <input
            type="range" min="0" max="100" step="5"
            value={Math.round((getSetting(ZONE_LIST[0].key).opacity) * 100)}
            onChange={(e) => setAllOpacity(parseInt(e.target.value) / 100)}
            className="flex-1 h-1 accent-red-500 cursor-pointer"
          />
          <span className="text-gray-500 text-[10px] w-7 text-right">
            {Math.round(getSetting(ZONE_LIST[0].key).opacity * 100)}%
          </span>
        </div>

        {/* 해역 목록 */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {/* JWC War Risk Zones */}
          <p className="text-[10px] text-gray-500 uppercase tracking-wider px-2 pt-1">JWC War Risk Zones</p>
          {warZones.map((zone) => (
            <ZoneRow key={zone.key} zone={zone} setting={getSetting(zone.key)} onUpdate={(p) => update(zone.key, p)} />
          ))}

          {/* Territorial Waters */}
          <p className="text-[10px] text-gray-500 uppercase tracking-wider px-2 pt-2">Territorial Waters (12NM)</p>
          {territorialZones.map((zone) => (
            <ZoneRow key={zone.key} zone={zone} setting={getSetting(zone.key)} onUpdate={(p) => update(zone.key, p)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ZoneRow({ zone, setting, onUpdate }) {
  const [showColors, setShowColors] = React.useState(false);

  return (
    <div className={`rounded-lg px-2 py-1.5 transition ${setting.visible ? "bg-gray-800" : "bg-gray-800/40 opacity-60"}`}>
      {/* 상단: 토글 + 이름 + 색상 점 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdate({ visible: !setting.visible })}
          className={`w-4 h-4 rounded flex-shrink-0 border transition ${
            setting.visible ? "border-green-500 bg-green-600" : "border-gray-600 bg-gray-700"
          }`}
          title={setting.visible ? "숨기기" : "표시"}
        >
          {setting.visible && <span className="text-white text-[10px] flex items-center justify-center">✓</span>}
        </button>

        <span className="text-xs text-gray-200 flex-1 truncate">{zone.label}</span>

        {/* 색상 점 (클릭으로 색상 선택 토글) */}
        <button
          onClick={() => setShowColors((v) => !v)}
          className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-600 hover:border-white transition"
          style={{ backgroundColor: setting.color }}
          title="색상 변경"
        />

        {/* 투명도 슬라이더 */}
        <input
          type="range" min="0" max="100" step="5"
          value={Math.round(setting.opacity * 100)}
          onChange={(e) => onUpdate({ opacity: parseInt(e.target.value) / 100 })}
          className="w-12 sm:w-16 h-1 accent-gray-400 cursor-pointer"
          title={`투명도 ${Math.round(setting.opacity * 100)}%`}
        />
        <span className="text-[10px] text-gray-500 w-6 text-right">{Math.round(setting.opacity * 100)}%</span>
      </div>

      {/* 색상 선택 패널 */}
      {showColors && (
        <div className="flex gap-1.5 mt-1.5 pl-6">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { onUpdate({ color: c }); setShowColors(false); }}
              className="w-5 h-5 rounded-full hover:scale-110 transition flex-shrink-0"
              style={{
                backgroundColor: c,
                outline: setting.color === c ? "2px solid white" : "2px solid transparent",
                outlineOffset: "1px",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
