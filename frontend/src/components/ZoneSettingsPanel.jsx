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

  // ── Europe — Black Sea (신규, JWLA 033 단일 구역) ──
  { key: "JWLA 033 - Black Sea & Sea of Azov", label: "Black Sea & Sea of Azov", group: "europe" },

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

// JWLA 033 HRA 국가 영토 목록 (별도 레이어)
const COUNTRY_ZONE_LIST = [
  // ── Europe ────────────────────────────────────────
  { key: "JWLA 033 Country - Russia",        label: "Russia",              group: "countries-europe"   },
  { key: "JWLA 033 Country - Ukraine",       label: "Ukraine",             group: "countries-europe"   },
  { key: "JWLA 033 Country - Belarus",       label: "Belarus",             group: "countries-europe"   },
  // ── Middle East ───────────────────────────────────
  { key: "JWLA 033 Country - Saudi Arabia",  label: "Saudi Arabia",        group: "countries-mideast"  },
  { key: "JWLA 033 Country - Yemen",         label: "Yemen",               group: "countries-mideast"  },
  { key: "JWLA 033 Country - Iran",          label: "Iran",                group: "countries-mideast"  },
  { key: "JWLA 033 Country - Iraq",          label: "Iraq",                group: "countries-mideast"  },
  { key: "JWLA 033 Country - Oman",          label: "Oman",                group: "countries-mideast"  },
  // ── East Africa ───────────────────────────────────
  { key: "JWLA 033 Country - Libya",         label: "Libya",               group: "countries-africa-e" },
  { key: "JWLA 033 Country - Sudan",         label: "Sudan",               group: "countries-africa-e" },
  { key: "JWLA 033 Country - Eritrea",       label: "Eritrea",             group: "countries-africa-e" },
  { key: "JWLA 033 Country - Djibouti",      label: "Djibouti",            group: "countries-africa-e" },
  { key: "JWLA 033 Country - Somalia",       label: "Somalia",             group: "countries-africa-e" },
  { key: "JWLA 033 Country - Mozambique (N.)", label: "Mozambique (N.)",   group: "countries-africa-e" },
  // ── West Africa ───────────────────────────────────
  { key: "JWLA 033 Country - Nigeria",       label: "Nigeria",             group: "countries-africa-w" },
  { key: "JWLA 033 Country - Benin",         label: "Benin",               group: "countries-africa-w" },
  { key: "JWLA 033 Country - Togo",          label: "Togo",                group: "countries-africa-w" },
  // ── Americas ──────────────────────────────────────
  { key: "JWLA 033 Country - Venezuela",     label: "Venezuela",           group: "countries-americas" },
  { key: "JWLA 033 Country - Guyana",        label: "Guyana",              group: "countries-americas" },
];

// 지역 그룹 순서 및 표시 설정
const REGION_GROUPS = [
  { id: "war",               label: "Middle East — JWC",               defaultOpen: true  },
  { id: "territorial",       label: "Territorial Waters (12NM)",        defaultOpen: true  },
  { id: "europe",            label: "Europe — Black Sea / Azov",        defaultOpen: false },
  { id: "africa-east",       label: "Africa — East / Red Sea",          defaultOpen: false },
  { id: "africa-west",       label: "Africa — West / Gulf of Guinea",   defaultOpen: false },
  { id: "americas",          label: "Americas",                         defaultOpen: false },
];

const COUNTRY_REGION_GROUPS = [
  { id: "countries-europe",   label: "Europe",        defaultOpen: false },
  { id: "countries-mideast",  label: "Middle East",   defaultOpen: false },
  { id: "countries-africa-e", label: "East Africa",   defaultOpen: false },
  { id: "countries-africa-w", label: "West Africa",   defaultOpen: false },
  { id: "countries-americas", label: "Americas",      defaultOpen: false },
];

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

const DEFAULT_ZONE = { visible: true, color: "#ef4444", opacity: 0.15 };
// 국가 레이어 기본값: 주황색, 낮은 투명도로 해역 레이어와 시각적 구분
const COUNTRY_DEFAULT_ZONE = { visible: true, color: "#f97316", opacity: 0.10 };

export { ZONE_LIST, COUNTRY_ZONE_LIST, DEFAULT_ZONE, COUNTRY_DEFAULT_ZONE };

export default function ZoneSettingsPanel({ zoneSettings, onUpdate, onClose }) {
  const [activeTab, setActiveTab] = React.useState("sea"); // "sea" | "country"

  const getSetting = (key) => ({ ...DEFAULT_ZONE, ...zoneSettings[key] });
  const getCountrySetting = (key) => ({ ...COUNTRY_DEFAULT_ZONE, ...zoneSettings[key] });

  const update = (key, patch) => {
    onUpdate({ ...zoneSettings, [key]: { ...getSetting(key), ...patch } });
  };

  // ── 해역 탭 전체 제어 ──
  const allSeaVisible = ZONE_LIST.every((z) => getSetting(z.key).visible);
  const noneSeaVisible = ZONE_LIST.every((z) => !getSetting(z.key).visible);
  const toggleAllSea = (visible) => {
    const next = { ...zoneSettings };
    ZONE_LIST.forEach((z) => { next[z.key] = { ...getSetting(z.key), visible }; });
    onUpdate(next);
  };
  const seaOpacity = getSetting(ZONE_LIST[0].key).opacity;
  const setAllSeaOpacity = (opacity) => {
    const next = { ...zoneSettings };
    ZONE_LIST.forEach((z) => { next[z.key] = { ...getSetting(z.key), opacity }; });
    onUpdate(next);
  };

  // ── 국가 탭 전체 제어 ──
  const allCountryVisible = COUNTRY_ZONE_LIST.every((z) => getCountrySetting(z.key).visible);
  const noneCountryVisible = COUNTRY_ZONE_LIST.every((z) => !getCountrySetting(z.key).visible);
  const toggleAllCountry = (visible) => {
    const next = { ...zoneSettings };
    COUNTRY_ZONE_LIST.forEach((z) => { next[z.key] = { ...getCountrySetting(z.key), visible }; });
    onUpdate(next);
  };
  const countryOpacity = getCountrySetting(COUNTRY_ZONE_LIST[0].key).opacity;
  const setAllCountryOpacity = (opacity) => {
    const next = { ...zoneSettings };
    COUNTRY_ZONE_LIST.forEach((z) => { next[z.key] = { ...getCountrySetting(z.key), opacity }; });
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
            <p className="text-gray-500 text-[10px]">JWLA 033</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg px-1">✕</button>
        </div>

        {/* 탭 전환 */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab("sea")}
            className={`flex-1 py-2 text-xs font-medium transition ${
              activeTab === "sea"
                ? "text-red-400 border-b-2 border-red-500 bg-gray-800/50"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            해역 구역 ({ZONE_LIST.length})
          </button>
          <button
            onClick={() => setActiveTab("country")}
            className={`flex-1 py-2 text-xs font-medium transition ${
              activeTab === "country"
                ? "text-orange-400 border-b-2 border-orange-500 bg-gray-800/50"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            국가 HRA ({COUNTRY_ZONE_LIST.length})
          </button>
        </div>

        {/* ── 해역 탭 ── */}
        {activeTab === "sea" && (
          <>
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
              <button
                onClick={() => toggleAllSea(!allSeaVisible)}
                className={`px-2.5 py-1 text-xs rounded transition ${
                  allSeaVisible ? "bg-red-700 text-white" : noneSeaVisible ? "bg-gray-700 text-gray-400" : "bg-gray-600 text-gray-300"
                }`}
              >
                {allSeaVisible ? "전체 숨기기" : "전체 표시"}
              </button>
              <span className="text-gray-500 text-[10px] ml-1">전체 투명도</span>
              <input
                type="range" min="0" max="100" step="5"
                value={Math.round(seaOpacity * 100)}
                onChange={(e) => setAllSeaOpacity(parseInt(e.target.value) / 100)}
                className="flex-1 h-1 accent-red-500 cursor-pointer"
              />
              <span className="text-gray-500 text-[10px] w-7 text-right">{Math.round(seaOpacity * 100)}%</span>
            </div>
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
          </>
        )}

        {/* ── 국가 탭 ── */}
        {activeTab === "country" && (
          <>
            <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
              <button
                onClick={() => toggleAllCountry(!allCountryVisible)}
                className={`px-2.5 py-1 text-xs rounded transition ${
                  allCountryVisible ? "bg-orange-700 text-white" : noneCountryVisible ? "bg-gray-700 text-gray-400" : "bg-gray-600 text-gray-300"
                }`}
              >
                {allCountryVisible ? "전체 숨기기" : "전체 표시"}
              </button>
              <span className="text-gray-500 text-[10px] ml-1">전체 투명도</span>
              <input
                type="range" min="0" max="100" step="5"
                value={Math.round(countryOpacity * 100)}
                onChange={(e) => setAllCountryOpacity(parseInt(e.target.value) / 100)}
                className="flex-1 h-1 accent-orange-500 cursor-pointer"
              />
              <span className="text-gray-500 text-[10px] w-7 text-right">{Math.round(countryOpacity * 100)}%</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {COUNTRY_REGION_GROUPS.map((group) => {
                const zones = COUNTRY_ZONE_LIST.filter((z) => z.group === group.id);
                if (zones.length === 0) return null;
                return (
                  <RegionSection
                    key={group.id}
                    group={group}
                    zones={zones}
                    zoneSettings={zoneSettings}
                    onUpdate={onUpdate}
                    getSetting={getCountrySetting}
                    accentColor="orange"
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RegionSection({ group, zones, zoneSettings, onUpdate, getSetting, accentColor = "red" }) {
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
              ? accentColor === "orange"
                ? "bg-orange-900/60 text-orange-400 hover:bg-orange-800/60"
                : "bg-red-900/60 text-red-400 hover:bg-red-800/60"
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
