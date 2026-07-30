import React from "react";
import {
  JWLA_REFERENCE,
  RISK_AREA_SECTIONS,
  applyItemVisibility,
  getCalendarStatus,
  getLayerDefaults,
  isItemVisible,
} from "./riskAreaCatalog.js";

function mergeItemSetting(settings, areaItem, patch) {
  if (!areaItem.layerKeys?.length || areaItem.dataStatus !== "ready") return settings;
  const next = { ...settings };
  for (const key of areaItem.layerKeys) {
    next[key] = { ...getLayerDefaults(key), ...settings[key], ...patch };
  }
  return next;
}

function statusDescriptor(areaItem) {
  if (areaItem.dataStatus === "withdrawn") {
    return { label: "최신 목록 삭제", className: "text-red-400" };
  }
  if (areaItem.ruleType) {
    const calendarStatus = getCalendarStatus(areaItem);
    return calendarStatus === "ACTIVE"
      ? { label: "현재 ACTIVE", className: "text-emerald-400" }
      : { label: "현재 INACTIVE", className: "text-gray-500" };
  }
  if (areaItem.designationStatus === "active") {
    return { label: "공식 활성", className: "text-amber-400" };
  }
  return { label: "경계 검증 중", className: "text-amber-500" };
}

export default function AreaPanel({
  zoneSettings = {},
  onUpdate,
  onFocusArea,
  compact = false,
  showAppearance = false,
}) {
  const [openSections, setOpenSections] = React.useState(
    () => new Set(RISK_AREA_SECTIONS.filter((section) => section.defaultOpen).map((section) => section.id)),
  );

  const toggleSectionOpen = (sectionId) => {
    setOpenSections((previous) => {
      const next = new Set(previous);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });
  };

  const update = (next) => onUpdate?.(next);

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-900" data-testid="risk-area-panel">
      <div className={`border-b border-gray-700 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold text-white">Current Risk Area Reference</h2>
              <span className="rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-bold text-red-300 border border-red-800">
                {JWLA_REFERENCE.circular}
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-gray-400">
              Published {JWLA_REFERENCE.publishedAt}. Latest-reference visualization; contract application and alerts may differ.
            </p>
          </div>
          <a
            href={JWLA_REFERENCE.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-[10px] text-blue-400 hover:text-blue-300 underline"
          >
            LMA PDF
          </a>
        </div>
        <div className="mt-2 rounded-md border border-amber-800/70 bg-amber-950/35 px-2 py-1.5 text-[10px] leading-4 text-amber-200">
          참고지도와 계약 경보는 분리됩니다. JWC·IBF/ITF·IWL은 서로 다른 기준이며 자동 담보판정에 사용하지 않습니다.
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        {RISK_AREA_SECTIONS.map((section) => {
          const open = openSections.has(section.id);
          const readyItems = section.items.filter((areaItem) => areaItem.dataStatus === "ready" && areaItem.layerKeys.length > 0);
          const allVisible = readyItems.length > 0 && readyItems.every((areaItem) => isItemVisible(zoneSettings, areaItem));
          const visibleCount = readyItems.filter((areaItem) => isItemVisible(zoneSettings, areaItem)).length;

          return (
            <section key={section.id} className="mb-2 overflow-hidden rounded-lg border border-gray-700/80 bg-gray-900/70">
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => toggleSectionOpen(section.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left hover:bg-gray-800 transition"
                  aria-expanded={open}
                >
                  <span aria-hidden="true" className="text-[10px] text-gray-500">{open ? "▾" : "▸"}</span>
                  <span className="h-3 w-1 rounded-full" style={{ backgroundColor: section.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-gray-200">{section.label}</span>
                    <span className="block text-[9px] text-gray-500">{section.countLabel || `${section.items.length} areas`} · {section.regime}</span>
                  </span>
                </button>
                {readyItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      let next = zoneSettings;
                      for (const areaItem of readyItems) next = applyItemVisibility(next, areaItem, !allVisible);
                      update(next);
                    }}
                    className="border-l border-gray-700 px-2 text-[9px] font-medium text-gray-400 hover:bg-gray-800 hover:text-white"
                    title={allVisible ? "이 섹션 전체 숨기기" : "이 섹션 전체 표시"}
                  >
                    {visibleCount}/{readyItems.length}
                  </button>
                )}
              </div>

              {open && (
                <div className="border-t border-gray-800">
                  <p className="px-3 py-2 text-[9px] leading-4 text-gray-500">{section.description}</p>
                  <div className="space-y-0.5 px-1.5 pb-2">
                    {section.items.map((areaItem) => {
                      const ready = areaItem.dataStatus === "ready" && areaItem.layerKeys.length > 0;
                      const visible = isItemVisible(zoneSettings, areaItem);
                      const firstKey = areaItem.layerKeys[0];
                      const setting = firstKey
                        ? { ...getLayerDefaults(firstKey), ...zoneSettings[firstKey] }
                        : null;
                      const status = statusDescriptor(areaItem);

                      return (
                        <div
                          key={areaItem.id}
                          className={`rounded-md border px-2 py-1.5 ${
                            ready ? "border-gray-800 bg-gray-800/70" : "border-gray-800/60 bg-gray-900/70 opacity-70"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!ready}
                              onClick={() => update(applyItemVisibility(zoneSettings, areaItem, !visible))}
                              className={`flex h-6 w-6 sm:h-4 sm:w-4 shrink-0 items-center justify-center rounded border text-[10px] transition ${
                                visible && ready
                                  ? "border-green-500 bg-green-600 text-white"
                                  : "border-gray-600 bg-gray-800 text-transparent"
                              } ${ready ? "cursor-pointer" : "cursor-not-allowed"}`}
                              aria-label={`${areaItem.label} ${visible ? "숨기기" : "표시"}`}
                            >
                              ✓
                            </button>
                            <span className={`min-w-0 flex-1 text-[11px] leading-4 ${areaItem.dataStatus === "withdrawn" ? "text-gray-500 line-through" : "text-gray-200"}`}>
                              {areaItem.label}
                            </span>
                            {areaItem.badge && (
                              <span
                                className="shrink-0 rounded border px-1 py-0.5 text-[8px] font-bold"
                                style={{ color: areaItem.color, borderColor: `${areaItem.color}88`, backgroundColor: `${areaItem.color}18` }}
                              >
                                {areaItem.badge}
                              </span>
                            )}
                            {ready ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!visible) update(applyItemVisibility(zoneSettings, areaItem, true));
                                  onFocusArea?.(firstKey);
                                }}
                                className="shrink-0 rounded p-2 sm:p-1 text-gray-500 hover:bg-gray-700 hover:text-white"
                                title="지도에서 보기"
                                aria-label={`${areaItem.label} 지도에서 보기`}
                              >
                                ⌖
                              </button>
                            ) : (
                              <span className={`shrink-0 text-right text-[8px] leading-3 ${status.className}`} title="지도 경계 검증 중">
                                {status.label}
                              </span>
                            )}
                          </div>

                          {areaItem.note && (
                            <p className="mt-1 pl-8 sm:pl-6 text-[9px] leading-3.5 text-gray-500">{areaItem.note}</p>
                          )}

                          {showAppearance && ready && setting && (
                            <div className="mt-1.5 flex items-center gap-2 pl-8 sm:pl-6">
                              <input
                                type="color"
                                value={setting.color}
                                onChange={(event) => update(mergeItemSetting(zoneSettings, areaItem, { color: event.target.value }))}
                                className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                                title="색상"
                              />
                              <span className="text-[9px] text-gray-500">투명도</span>
                              <input
                                type="range"
                                min="0"
                                max="40"
                                step="2"
                                value={Math.round(setting.opacity * 100)}
                                onChange={(event) => update(mergeItemSetting(zoneSettings, areaItem, { opacity: Number(event.target.value) / 100 }))}
                                className="h-1 flex-1 cursor-pointer accent-gray-400"
                              />
                              <span className="w-7 text-right text-[9px] text-gray-500">{Math.round(setting.opacity * 100)}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="border-t border-gray-800 px-3 py-2 text-[9px] leading-4 text-gray-500">
        Geometry: reference-only Marine Regions/Natural Earth-derived shapes. Not for navigation or automatic coverage determination.
      </div>
    </div>
  );
}
