import React from "react";
import {
  JWLA_REFERENCE,
  RISK_AREA_SECTIONS,
  applyItemVisibility,
  applySectionAppearance,
  getCalendarStatus,
  getLayerDefaults,
  isComparisonModeEnabled,
  isItemVisible,
  resetSectionAppearance,
  setComparisonMode,
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
  const [openSections, setOpenSections] = React.useState(() => new Set(
    RISK_AREA_SECTIONS.flatMap((section) => [section, ...(section.subsections || [])])
      .filter((section) => section.defaultOpen)
      .map((section) => section.id),
  ));

  const toggleSectionOpen = (sectionId) => {
    setOpenSections((previous) => {
      const next = new Set(previous);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });
  };

  const update = (next) => onUpdate?.(next);

  const renderAreaSection = (section, { nested = false } = {}) => {
    const open = openSections.has(section.id);
    const readyItems = section.items.filter((areaItem) => areaItem.dataStatus === "ready" && areaItem.layerKeys.length > 0);
    const allVisible = readyItems.length > 0 && readyItems.every((areaItem) => isItemVisible(zoneSettings, areaItem));
    const visibleCount = readyItems.filter((areaItem) => isItemVisible(zoneSettings, areaItem)).length;
    const sectionLayerSettings = readyItems.flatMap((areaItem) => areaItem.layerKeys.map((layerKey) => ({
      ...getLayerDefaults(layerKey),
      ...zoneSettings[layerKey],
    })));
    const sectionColors = new Set(sectionLayerSettings.map((setting) => setting.color));
    const sectionOpacities = new Set(sectionLayerSettings.map((setting) => setting.opacity));
    const groupColor = sectionColors.size === 1 ? sectionLayerSettings[0]?.color : section.color;
    const groupOpacity = sectionOpacities.size === 1
      ? sectionLayerSettings[0]?.opacity
      : readyItems[0]?.opacity;
    const hasMixedAppearance = sectionColors.size > 1 || sectionOpacities.size > 1;

    return (
      <section
        key={section.id}
        className={`${nested ? "mb-1.5 border-gray-800 bg-gray-950/40" : "mb-2 border-gray-700/80 bg-gray-900/70"} overflow-hidden rounded-lg border`}
      >
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
            {showAppearance && readyItems.length > 0 && (
              <div
                className="mx-1.5 mb-2 flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-gray-700 bg-gray-950/70 px-2 py-2"
                data-testid={`section-appearance-${section.id}`}
              >
                <span className="shrink-0 text-[9px] font-semibold text-gray-300">그룹 전체</span>
                <input
                  type="color"
                  value={groupColor || section.color}
                  onChange={(event) => update(applySectionAppearance(zoneSettings, section, { color: event.target.value }))}
                  className="h-6 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`${section.label} 그룹 색상`}
                  title="그룹 전체 색상"
                />
                <span className="shrink-0 text-[9px] text-gray-500">투명도</span>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="2"
                  value={Math.round((groupOpacity || 0) * 100)}
                  onChange={(event) => update(applySectionAppearance(zoneSettings, section, { opacity: Number(event.target.value) / 100 }))}
                  className="h-1 min-w-[96px] flex-1 cursor-pointer accent-gray-400"
                  aria-label={`${section.label} 그룹 투명도`}
                />
                <span className="w-8 shrink-0 text-right text-[9px] text-gray-500">
                  {Math.round((groupOpacity || 0) * 100)}%
                </span>
                {hasMixedAppearance && (
                  <span className="text-[8px] text-amber-400">혼합 설정 · 변경 시 전체 적용</span>
                )}
                <button
                  type="button"
                  onClick={() => update(resetSectionAppearance(zoneSettings, section))}
                  className="ml-auto shrink-0 rounded border border-gray-600 px-2 py-1 text-[8px] text-gray-300 hover:border-gray-500 hover:bg-gray-800"
                  aria-label={`${section.label} 그룹 기본값 적용`}
                >
                  기본값 적용
                </button>
              </div>
            )}
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
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 pl-8 sm:pl-6">
                        <input
                          type="color"
                          value={setting.color}
                          onChange={(event) => update(mergeItemSetting(zoneSettings, areaItem, { color: event.target.value }))}
                          className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                          title="색상"
                          aria-label={`${areaItem.label} 색상`}
                        />
                        <span className="text-[9px] text-gray-500">투명도</span>
                        <input
                          type="range"
                          min="0"
                          max="40"
                          step="2"
                          value={Math.round(setting.opacity * 100)}
                          onChange={(event) => update(mergeItemSetting(zoneSettings, areaItem, { opacity: Number(event.target.value) / 100 }))}
                          className="h-1 min-w-[96px] flex-1 cursor-pointer accent-gray-400"
                          aria-label={`${areaItem.label} 투명도`}
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
  };

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col bg-gray-900" data-testid="risk-area-panel">
      <div className={`border-b border-gray-700 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm font-semibold text-white">JWLA-034 Listed Areas</h2>
              <span className="rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-bold text-red-300 border border-red-800">
                CURRENT
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-4 text-gray-400">
              공식 의미에 따라 Defined Waters, Named Countries, Call-Only 조건으로 분류합니다. Published {JWLA_REFERENCE.publishedAt}.
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
      </div>

      <div
        className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2"
        data-testid="risk-settings-scroll"
      >
        {RISK_AREA_SECTIONS.map((section) => {
          if (!section.subsections) return renderAreaSection(section);
          const open = openSections.has(section.id);
          return (
            <section key={section.id} className="mb-2 overflow-hidden rounded-lg border border-gray-700/80 bg-gray-900/70">
              <button
                type="button"
                onClick={() => toggleSectionOpen(section.id)}
                className="flex w-full min-w-0 items-center gap-2 px-2.5 py-2 text-left hover:bg-gray-800 transition"
                aria-expanded={open}
              >
                <span aria-hidden="true" className="text-[10px] text-gray-500">{open ? "▾" : "▸"}</span>
                <span className="h-3 w-1 rounded-full" style={{ backgroundColor: section.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-gray-200">{section.label}</span>
                  <span className="block text-[9px] text-gray-500">{section.countLabel} · {section.regime}</span>
                </span>
              </button>
              {open && (
                <div className="border-t border-gray-800 px-1.5 pt-2">
                  <p className="px-1.5 pb-2 text-[9px] leading-4 text-gray-500">{section.description}</p>
                  {section.subsections.map((subsection) => renderAreaSection(subsection, { nested: true }))}
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-yellow-900/70 bg-yellow-950/20 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold text-yellow-200">JWLA-033과 비교</span>
                      <span className="block text-[8px] leading-3 text-gray-500">backend baseline 22개와 JWLA-034 변경분을 함께 표시</span>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isComparisonModeEnabled(zoneSettings)}
                      onClick={() => update(setComparisonMode(zoneSettings, !isComparisonModeEnabled(zoneSettings)))}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
                        isComparisonModeEnabled(zoneSettings)
                          ? "border-yellow-500 bg-yellow-600 text-white"
                          : "border-gray-600 bg-gray-800 text-gray-400"
                      }`}
                    >
                      {isComparisonModeEnabled(zoneSettings) ? "ON" : "OFF"}
                    </button>
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
