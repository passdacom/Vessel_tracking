import React from "react";

// 전체 해역 목록 (GeoJSON feature name → 표시용 짧은 이름)
const ZONE_LIST = [
  // ── Middle East (기존) ──────────────────────────────
  { key: "JWC War Risk Zone - Persian Gulf", label: "Persian Gulf", group: "war" },
  { key: "JWC War Risk Zone - Gulf of Oman", label: "Gulf of Oman", group: "war" },
  { key: "JWC War Risk Zone - Gulf of Aden", label: "Gulf of Aden", group: "war" },
  { key: "JWC War Risk Zone - Red Sea (S of 18N)", label: "Red Sea (S of 18N)", group: "war" },
  { key: "JWC War Risk Zone - Arabian Sea (JWC West)", label: "Arabian Sea", group: "war" },
  { key: "JWC War Risk Zone - Indian Ocean (JWC North-West)", label: "Indian Ocean (NW)", group: "war" },

  // ── Territorial Waters (기존) ───────────────────────
  { key: "Saudi Arabia 12NM Territorial Waters (Red Sea)", label: "Saudi Arabia 12NM", group: "territorial" },
  { key: "Israel 12NM Territorial Waters", label: "Israel 12NM", group: "territorial" },
  { key: "Lebanon 12NM Territorial Waters", label: "Lebanon 12NM", group: "territorial" },

  // ── Europe — Black Sea (신규) ───────────────────────
  { key: "JWLA 033 - Black Sea", label: "Black Sea", group: "europe" },
  { key: "JWLA 033 - Sea of Azov", label: "Sea of Azov", group: "europe" },

  // ── East Africa / Red Sea (신규) ───────────────────
  { key: "JWLA 033 - Libya (Coastal 12NM)", label: "Libya (12NM)", group: "africa-east" },
  { key: "JWLA 033 - Sudan (Red Sea Coastal)", label: "Sudan (Red Sea)", group: "africa-east" },
  { key: "JWLA 033 - Eritrea (S of 18N)", label: "Eritrea (S of 18N)", group: "africa-east" },
  { key: "JWLA 033 - Djibouti (Coastal)", label: "Djibouti (12NM)", group: "africa-east" },
  { key: "JWLA 033 - Somalia (Coastal)", label: "Somalia (12NM)", group: "africa-east" },
  { key: "JWLA 033 - Cabo Delgado / N.Mozambique", label: "Cabo Delgado / N.Moz.", group: "africa-east" },

  // ── West Africa / Gulf of Guinea (신규) ────────────
  { key: "JWLA 033 - Gulf of Guinea", label: "Gulf of Guinea", group: "africa-west" },
  { key: "JWLA 033 - Nigeria (Coastal 12NM)", label: "Nigeria (12NM)", group: "africa-west" },
  { key: "JWLA 033 - Benin (Coastal 12NM)", label: "Benin (12NM)", group: "africa-west" },
  { key: "JWLA 033 - Togo (Coastal 12NM)", label: "Togo (12NM)", group: "africa-west" },

  // ── Americas (신규) ────────────────────────────────
  { key: "JWLA 033 - Venezuela (Offshore EEZ)", label: "Venezuela (EEZ)", group: "americas" },
  { key: "JWLA 033 - Guyana (Offshore EEZ)", label: "Guyana (EEZ)", group: "americas" },
];

// 지역 그룹 순서 및 표시 설정
const REGION_GROUPS = [
  { id: "war",         label: "Middle East — JWC",         defaultOpen: true  },
  { id: "territorial", label: "Territorial Waters (12NM)",  defaultOpen: true  },
  { id: "europe",      label: "Europe — Black Sea",         defaultOpen: false },
  { id: "africa-east", label: "Africa — East / Red Sea",    defaultOpen: false },
  { id: "africa-west", label: "Africa — West / Gulf of Guinea", defaultOpen: false },
  { id: "americas",    label: "Americas",                   defaultOpen: false },
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

  // 전체 투명도는 첫 번째 visible 존에서 읽거나 fallback
  const firstKey = ZONE_LIST[0].key;
  const globalOpacity = getSetting(firstKey).opacity;

  const setAllOpacity = (opacity) => {
    const next = { ...zoneSettings };
    ZONE_LIST.forEach((z) => {
      next[z.key] = { ...getSetting(z.key), opacity };
    });
    onUpdate(next);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[92vw] sm:w-[360px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-white text-sm font-semibold">War Risk Zone 설정</h3>
            <p className="text-gray-500 text-[10px]">JWLA 033 · {ZONE_LIST.length}개 구역</p>
          </div>
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
            value={Math.round(globalOpacity * 100)}
            onChange={(e) => setAllOpacity(parseInt(e.target.value) / 100)}
            className="flex-1 h-1 accent-red-500 cursor-pointer"
          />
          <span className="text-gray-500 text-[10px] w-7 text-right">
            {Math.round(globalOpacity * 100)}%
          </span>
        </div>

        {/* 지역별 섹션 */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {REGION_GROUPS.map((group) => {
            const zones = ZONE_LIST.filter((z) => z.group === group.id);
            if (zones.length === 0) return null;
            return (
              <RegionSection
                key={group.id}
                group={group}
                zones={zones}
                zoneSettings={zoneSettings}
                onUpdate={onUpdate}
                getSetting={getSetting}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RegionSection({ group, zones, zoneSettings, onUpdate, getSetting }) {
  const [open, setOpen] = React.useState(group.defaultOpen);

  const allOn = zones.every((z) => getSetting(z.key).visible);
  const allOff = zones.every((z) => !getSetting(z.key).visible);

  const toggleGroup = (e) => {
    e.stopPropagation();
    const visible = !allOn;
    const next = { ...zoneSettings };
    zones.forEach((z) => { next[z.key] = { ...getSetting(z.key), visible }; });
    onUpdate(next);
  };

  const update = (key, patch) => {
    onUpdate({ ...zoneSettings, [key]: { ...getSetting(key), ...patch } });
  };

  return (
    <div className="mb-0.5">
      {/* 섹션 헤더 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider hover:text-gray-200 transition rounded"
      >
        <span className="text-gray-600 text-[9px]">{open ? "▾" : "▸"}</span>
        <span className="flex-1 text-left">{group.label}</span>
        {/* 그룹 전체 on/off */}
        <span
          role="button"
          tabIndex={0}
          onClick={toggleGroup}
          onKeyDown={(e) => e.key === "Enter" && toggleGroup(e)}
          className={`text-[9px] px-1.5 py-0.5 rounded transition cursor-pointer ${
            allOff
              ? "bg-gray-700 text-gray-500"
              : allOn
              ? "bg-red-900/60 text-red-400 hover:bg-red-800/60"
              : "bg-gray-700/60 text-gray-400 hover:bg-gray-600/60"
          }`}
        >
          {allOff ? "ALL OFF" : allOn ? "ALL ON" : "SOME"}
        </span>
      </button>

      {/* 존 목록 (접힌 경우 숨김) */}
      {open && (
        <div className="space-y-0.5 pb-1 pl-1">
          {zones.map((zone) => (
            <ZoneRow
              key={zone.key}
              zone={zone}
              setting={getSetting(zone.key)}
              onUpdate={(p) => update(zone.key, p)}
            />
          ))}
        </div>
      )}
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
