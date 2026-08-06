export const JWLA_REFERENCE = Object.freeze({
  circular: "JWLA-034",
  previousCircular: "JWLA-033",
  publishedAt: "2026-07-29",
  sourceUrl: "https://lmalloyds.com/wp-content/uploads/2025/06/JWLA-034-Saudi-Arabia.pdf",
  sourceSha256: "125e507bbd187051315bdf80ae30583bc92ec9ad2d280d02fac2d10a019d03b9",
  committeeUrl: "https://lmalloyds.com/committee/joint-war-committee/",
  scope: "Current reference map; individual contract application remains subject to specific negotiation.",
});

const JWC_SOURCE = JWLA_REFERENCE.sourceUrl;
const IBF_SOURCE = "https://www.itfseafarers.org/en/resources/ibf-warlike-and-high-risk-areas";
const ITF_SOURCE = "https://www.itfseafarers.org/en/resources/itf-warlike-and-high-risk-areas-0";
const IWL_SOURCE = "https://jwla.ai/api/docs/IWL-1.7.76-CL26.pdf";
const DEFINED_WATERS_URL = "/risk-areas/jwla-034-reference.geojson";
const COASTAL_URL = "/risk-areas/jwla-034-coastal-waters.geojson";
const PROVISIONAL_COASTAL_URL = "/risk-areas/jwla-034-coastal-waters-provisional.geojson";

const item = ({
  id,
  label,
  layerKey,
  layerKeys,
  badge,
  note,
  defaultVisible = false,
  color = "#ef4444",
  opacity = 0.15,
  sourceUrl = JWC_SOURCE,
  dataStatus = "ready",
  ...metadata
}) => Object.freeze({
  id,
  label,
  layerKeys: layerKeys || (layerKey ? [layerKey] : []),
  badge,
  note,
  defaultVisible,
  color,
  opacity,
  sourceUrl,
  dataStatus,
  ...metadata,
});

const VERIFIED_COASTAL_COUNTRIES = new Set(["russia", "syria"]);
const EXISTING_COASTAL_COUNTRIES = new Set(["israel", "lebanon"]);

const country = (id, label, group) => {
  const geometryStatus = VERIFIED_COASTAL_COUNTRIES.has(id)
    ? "verified"
    : EXISTING_COASTAL_COUNTRIES.has(id)
      ? "existing-baseline"
      : "provisional";
  const coastalLayerKey = `JWLA 034 Coastal Waters - ${label} 12NM`;
  const layerKeys = [coastalLayerKey];
  if (id === "venezuela") layerKeys.push("JWLA 034 - Venezuela Offshore Installation Reference");

  let note;
  if (id === "venezuela") {
    note = "Current JWLA-034 scope: ports and coastal waters up to 12NM, plus offshore installations in the Venezuelan EEZ. The EEZ is not a blanket listed area or transit geofence.";
  } else if (id === "iraq") {
    note = "Current JWLA-034 scope: ports and coastal waters up to 12NM, including all Iraqi offshore oil terminals. Terminal calls require manual review; no blanket offshore-water geofence is implied.";
  } else if (geometryStatus === "existing-baseline") {
    note = "Current JWLA-034 scope: ports and coastal waters up to 12NM. This visible geometry reuses the existing reviewed baseline input while replacement-source validation continues.";
  } else if (geometryStatus === "provisional") {
    note = "Current JWLA-034 scope: ports and coastal waters up to 12NM. The source-derived coastal geometry is displayed as the current reference; source review status is retained in metadata and it does not feed backend alerts.";
  } else {
    note = "Current JWLA-034 scope: ports and coastal waters up to 12NM. Reviewed source-derived coastal geometry; display controls do not change backend alerts.";
  }

  const badge = id === "venezuela"
    ? "CURRENT · 12NM + INSTALLATIONS"
    : id === "iraq"
      ? "CURRENT · TERMINALS"
      : geometryStatus === "verified"
        ? "CURRENT · REVIEWED"
        : geometryStatus === "existing-baseline"
          ? "CURRENT · EXISTING 12NM"
          : "CURRENT · SOURCE REVIEW";

  return {
    ...item({
      id: `jwc-country-${id}`,
      label,
      layerKeys,
      badge,
      note,
      defaultVisible: true,
      color: "#f97316",
      opacity: 0.1,
      geometryStatus,
      manualReviewRequired: geometryStatus === "provisional",
    }),
    group,
  };
};

const pending = (id, label, { badge, note, sourceUrl, color, dataStatus = "pending", ...metadata }) => item({
  id,
  label,
  badge,
  note,
  sourceUrl,
  color,
  opacity: 0.08,
  dataStatus,
  ...metadata,
});

const currentWater = (id, label, layerKey, group, color, note, extra = {}) => item({
  id: `jwc-034-current-${id}`,
  label,
  layerKey,
  group,
  badge: id === "red-sea-added" ? "CURRENT · 034 ADDED" : "CURRENT",
  note,
  defaultVisible: true,
  color,
  opacity: id === "red-sea-added" ? 0.22 : 0.15,
  ...extra,
});

const JWC_034_CURRENT_WATERS = [
  currentWater("persian-gulf", "Persian Gulf (PG)", "JWLA 034 - Persian Gulf", "Middle East & Southern Red Sea", "#dc2626", "Current JWLA-034 subregion; individually styleable."),
  currentWater("gulf-of-oman", "Gulf of Oman (GOO)", "JWLA 034 - Gulf of Oman", "Middle East & Southern Red Sea", "#f97316", "Current JWLA-034 subregion; individually styleable."),
  currentWater("gulf-of-aden", "Gulf of Aden", "JWLA 034 - Gulf of Aden", "Middle East & Southern Red Sea", "#fb7185", "Current JWLA-034 subregion; individually styleable."),
  currentWater("red-sea-south", "Red Sea south of 18°N", "JWLA 034 - Red Sea south of 18N", "Middle East & Southern Red Sea", "#e11d48", "Current JWLA-034 Red Sea base south of the JWLA-033 18°N limit."),
  currentWater("red-sea-added", "JWLA-034 Added Area · Red Sea 18°N–25.5°N", "JWLA 034 - Red Sea Added Area 18N to 25.5N", "Middle East & Southern Red Sea", "#facc15", "Current JWLA-034 northward extension. Egyptian territorial waters are excluded with approximate reference geometry.", { changeType: "northward-extension", previousCircular: "JWLA-033" }),
  currentWater("arabian-sea", "Arabian Sea (JWC West)", "JWLA 034 - Arabian Sea JWC West", "Middle East & Southern Red Sea", "#8b5cf6", "Current JWLA-034 subregion; individually styleable."),
  currentWater("indian-ocean", "Indian Ocean (JWC North-West)", "JWLA 034 - Indian Ocean JWC North-West", "Middle East & Southern Red Sea", "#06b6d4", "Current JWLA-034 subregion; individually styleable."),
  currentWater("black-sea", "Black Sea & Sea of Azov", "JWLA 034 - Black Sea & Sea of Azov", "Black Sea & Sea of Azov", "#3b82f6", "Current maritime reference boundary. The circular's Ukraine, Don, Donets and Belarus inland-water clauses remain unresolved."),
  currentWater("gulf-guinea", "Gulf of Guinea", "JWLA 034 - Gulf of Guinea", "Gulf of Guinea", "#a855f7", "Current anchor-based informational reconstruction; coastline closure remains approximate."),
  currentWater("cabo-delgado", "Cabo Delgado", "JWLA 034 - Cabo Delgado", "Cabo Delgado", "#14b8a6", "Current Tanzania and Mozambique coastline-buffer reference constrained by the circular's published limits."),
];

const PROVISIONAL_COASTAL_SPECS = [
  ["bahrain", "Bahrain"],
  ["iran", "Iran"],
  ["iraq", "Iraq"],
  ["kuwait", "Kuwait"],
  ["oman", "Oman"],
  ["qatar", "Qatar"],
  ["saudi-arabia", "Saudi Arabia"],
  ["uae", "United Arab Emirates"],
  ["yemen", "Yemen"],
  ["djibouti", "Djibouti"],
  ["eritrea", "Eritrea"],
  ["libya", "Libya"],
  ["somalia", "Somalia"],
  ["sudan", "Sudan"],
  ["benin", "Benin"],
  ["nigeria", "Nigeria"],
  ["togo", "Togo"],
  ["venezuela", "Venezuela"],
];

const JWC_SPECIAL_CALL_ONLY = [
  item({
    id: "jwc-guyana-installations",
    label: "Guyana — offshore installation calls only",
    layerKey: "JWLA 034 - Guyana Offshore Installation Reference",
    badge: "CALLS ONLY",
    note: "JWLA-034 applies only to calls to offshore installations in the Guyanese EEZ beyond territorial waters. Guyana is not a general 12NM named-country area, and simple EEZ transit is not an entry event.",
    defaultVisible: true,
    color: "#fb7185",
    opacity: 0.05,
  }),
];

const JWC_COUNTRIES = [
  country("russia", "Russia", "Europe"),
  country("bahrain", "Bahrain", "Middle East"),
  country("iran", "Iran", "Middle East"),
  country("iraq", "Iraq", "Middle East"),
  country("israel", "Israel", "Middle East"),
  country("kuwait", "Kuwait", "Middle East"),
  country("lebanon", "Lebanon", "Middle East"),
  country("oman", "Oman", "Middle East"),
  country("qatar", "Qatar", "Middle East"),
  country("saudi-arabia", "Saudi Arabia", "Middle East"),
  country("syria", "Syria", "Middle East"),
  country("uae", "United Arab Emirates", "Middle East"),
  country("yemen", "Yemen", "Middle East"),
  country("djibouti", "Djibouti", "Africa"),
  country("eritrea", "Eritrea", "Africa"),
  country("libya", "Libya", "Africa"),
  country("somalia", "Somalia", "Africa"),
  country("sudan", "Sudan", "Africa"),
  country("benin", "Benin", "Africa"),
  country("nigeria", "Nigeria", "Africa"),
  country("togo", "Togo", "Africa"),
  country("venezuela", "Venezuela", "South America"),
];

const CONTRACT_ALERT_FILES = {
  "war-risk-zone.geojson": [
    "JWC War Risk Zone - Persian Gulf",
    "JWC War Risk Zone - Gulf of Oman",
    "JWC War Risk Zone - Gulf of Aden",
    "JWC War Risk Zone - Red Sea (S of 18N)",
    "JWC War Risk Zone - Arabian Sea (JWC West)",
    "JWC War Risk Zone - Indian Ocean (JWC North-West)",
  ],
  "12nm_bounds.geojson": [
    "Saudi Arabia 12NM Territorial Waters (Red Sea)",
    "Israel 12NM Territorial Waters",
    "Lebanon 12NM Territorial Waters",
  ],
  "war-risk-zone-global.geojson": [
    "JWLA 033 - Black Sea & Sea of Azov",
    "JWLA 033 - Gulf of Guinea",
    "JWLA 033 - Libya (Coastal 12NM)",
    "JWLA 033 - Sudan (Red Sea Coastal)",
    "JWLA 033 - Eritrea (S of 18N)",
    "JWLA 033 - Djibouti (Coastal)",
    "JWLA 033 - Somalia (Coastal)",
    "JWLA 033 - Cabo Delgado / N.Mozambique",
    "JWLA 033 - Nigeria (Coastal 12NM)",
    "JWLA 033 - Benin (Coastal 12NM)",
    "JWLA 033 - Togo (Coastal 12NM)",
    "JWLA 033 - Venezuela (Offshore EEZ)",
    "JWLA 033 - Guyana (Offshore EEZ)",
  ],
};

const CONTRACT_ALERT_ITEMS = Object.entries(CONTRACT_ALERT_FILES).flatMap(([sourceFile, names]) => (
  names.map((name) => item({
    id: `contract-alert-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    label: name,
    layerKey: name,
    badge: "BACKEND",
    note: `JWLA-033-era baseline from ${sourceFile}; this is also the boundary currently used by the backend geofence. Display controls do not change alert rules.`,
    defaultVisible: false,
    color: "#ef4444",
    opacity: 0.08,
    sourceUrl: null,
    sourceFile,
    mapKind: "contract-alert",
    contractAlertEligible: true,
  }))
));

const crewArea = (id, label, {
  badge,
  validFrom,
  ibfValidTo,
  designationStatus = "active",
  dataStatus = "pending",
  note,
}) => pending(id, label, {
  badge,
  note: note || "Official designation is current; geometry remains disabled until coastline, anchor and water-mask provenance is pinned and verified.",
  sourceUrl: IBF_SOURCE,
  secondarySourceUrl: ITF_SOURCE,
  sourceVersions: ["ibf-2026-07-23", "itf-2026-05-07"],
  validFrom,
  ibfValidTo,
  designationStatus,
  dataStatus,
  color: "#a855f7",
});

const IBF_ITF_ITEMS = [
  crewArea("ibf-yemen-mainland-12nm-woa", "Yemen mainland coast 12NM, including all ports", {
    badge: "WOA",
    validFrom: "2018-03-01T00:01:00Z",
    ibfValidTo: "2026-09-25",
    note: "Official Designation 1. Includes ports and mainland territorial waters to 12NM; excludes the Maritime Security Transit Corridor where it overlaps.",
  }),
  crewArea("ibf-red-sea-goa-woa", "Southern Red Sea and the Gulf of Aden", {
    badge: "WOA", validFrom: "2024-03-19", ibfValidTo: "2026-09-25",
  }),
  crewArea("ibf-sea-azov-woa", "Sea of Azov and the Strait of Kerch", {
    badge: "WOA", validFrom: "2023-11-01", ibfValidTo: "2026-09-25",
  }),
  crewArea("ibf-north-black-sea-woa", "Northern Black Sea Region", {
    badge: "WOA", validFrom: "2022-03-01", ibfValidTo: "2026-09-25",
  }),
  crewArea("ibf-ukraine-ports-woa", "All ports in Ukraine", {
    badge: "WOA",
    validFrom: "2022-03-01",
    ibfValidTo: "2026-09-25",
    note: "Official Designation 5. Applies to vessels at anchor or berthed all fast as well as vessels underway; port geometry remains disabled pending authoritative port boundaries.",
  }),
  crewArea("itf-black-sea-hra", "Black Sea", {
    badge: "HRA", validFrom: "2023-11-01", ibfValidTo: "2026-09-25",
  }),
  crewArea("ibf-persian-gulf-woa", "Persian Gulf, Straits of Hormuz and Gulf of Oman", {
    badge: "WOA", validFrom: "2026-03-06T00:01:00Z", ibfValidTo: "2026-08-10T00:01:00Z",
  }),
  crewArea("ibf-gulf-oman-erz", "Gulf of Oman", {
    badge: "ERZ", validFrom: "2026-03-02T00:01:00Z", ibfValidTo: "2026-08-10T00:01:00Z",
  }),
  crewArea("ibf-israel-lebanon-erz", "12 nautical miles off the coast of Israel and Lebanon", {
    badge: "ERZ", validFrom: "2026-03-13T00:01:00Z", ibfValidTo: "2026-08-10T00:01:00Z",
  }),
  crewArea("ibf-israel-lebanon-level2-erz", "Israeli Mediterranean and Lebanese Ports Level 2", {
    badge: "LEVEL 2",
    validFrom: "2026-04-03",
    ibfValidTo: "2026-08-10",
    note: "Official Designation 10. Applies only while alongside in the named ports and during pilotage on arrival or departure; it is not a general coastal-transit polygon.",
  }),
  crewArea("ibf-gulf-guinea-erz", "Gulf of Guinea", {
    badge: "WITHDRAWN",
    designationStatus: "withdrawn",
    dataStatus: "withdrawn",
    note: "Present on the stale JWLA.ai panel but deleted from both latest IBF and ITF lists. Exact withdrawal time is not inferred between source versions.",
  }),
];

const IWL_SPECS = [
  { id: "iwl-arctic", label: "Arctic", clauseRef: "3", ruleType: "YEAR_ROUND" },
  { id: "iwl-north-atlantic", label: "North Atlantic", clauseRef: "1(a)(i)", ruleType: "YEAR_ROUND" },
  { id: "iwl-greenland", label: "Greenland", clauseRef: "1(c)", ruleType: "YEAR_ROUND" },
  { id: "iwl-pacific-north-west", label: "Pacific North West", clauseRef: "1(d)", ruleType: "YEAR_ROUND" },
  { id: "iwl-great-lakes", label: "Great Lakes", clauseRef: "1(b)", ruleType: "YEAR_ROUND" },
  { id: "iwl-bering-east-asia", label: "Bering Sea / East Asia", clauseRef: "4", ruleType: "YEAR_ROUND" },
  { id: "iwl-southern-ocean", label: "Southern Ocean", clauseRef: "5", ruleType: "YEAR_ROUND" },
  { id: "iwl-gulf-st-lawrence-seasonal", label: "Gulf of St Lawrence Seasonal", clauseRef: "1(a)(ii)", ruleType: "SEASONAL", seasonStart: "12-21", seasonEnd: "04-30" },
  { id: "iwl-st-lawrence-seasonal", label: "St Lawrence Seasonal", clauseRef: "1(a)(iii)", ruleType: "SEASONAL", seasonStart: "12-01", seasonEnd: "04-30" },
  { id: "iwl-gulf-bothnia-north", label: "Gulf of Bothnia North", clauseRef: "2(a)", ruleType: "SEASONAL", seasonStart: "12-10", seasonEnd: "05-25" },
  { id: "iwl-gulf-finland-east", label: "Gulf of Finland East", clauseRef: "2(b)", ruleType: "SEASONAL", seasonStart: "12-15", seasonEnd: "05-15" },
  { id: "iwl-baltic-north", label: "Baltic North", clauseRef: "2(c)", ruleType: "SEASONAL", seasonStart: "01-08", seasonEnd: "05-05" },
  { id: "iwl-gulf-riga", label: "Gulf of Riga", clauseRef: "2(d)", ruleType: "SEASONAL", seasonStart: "12-28", seasonEnd: "05-05" },
];

const IWL_ITEMS = IWL_SPECS.map((spec) => pending(spec.id, spec.label, {
  badge: spec.ruleType === "SEASONAL" ? "SEASONAL" : "YEAR-ROUND",
  note: spec.ruleType === "SEASONAL"
    ? `CL26 ${spec.clauseRef}; ${spec.seasonStart}–${spec.seasonEnd}, both days inclusive. Calendar status is not a coverage determination.`
    : `CL26 ${spec.clauseRef}; year-round contractual reference. Voyage, port or cargo exceptions may require additional context.`,
  sourceUrl: IWL_SOURCE,
  sourceDocument: "Institute Warranties 1/7/76 CL26, supplied PDF reproduction",
  sourceSha256: "44923ed8638febb99d79ad8435410e50b9406df4572455928c682d5d189a0f4c",
  color: "#d97706",
  ...spec,
}));

const JWLA_034_SUBSECTIONS = Object.freeze([
  {
    id: "jwla-034-defined-waters",
    regime: "JWLA-034",
    label: "Defined Waters",
    countLabel: "4 official areas · 10 styleable layers",
    description: "Four official current defined-water areas are split into ten independently styleable map layers, including the JWLA-034 Added Area.",
    defaultOpen: true,
    color: "#dc2626",
    items: JWC_034_CURRENT_WATERS,
  },
  {
    id: "jwla-034-named-countries",
    regime: "JWLA-034",
    label: "JWLA-034 Named Countries",
    countLabel: "22 countries",
    description: "All 22 current named-country coastal waters up to 12NM are visible by default. Geometry source-review status is metadata, not a separate map group.",
    defaultOpen: true,
    color: "#f97316",
    items: JWC_COUNTRIES,
  },
  {
    id: "jwla-034-special-call-only",
    regime: "JWLA-034",
    label: "Special Call-Only Areas",
    countLabel: "1 special condition",
    description: "Activity-based wording that must not be represented as a blanket EEZ transit area.",
    defaultOpen: false,
    color: "#fb7185",
    items: JWC_SPECIAL_CALL_ONLY,
  },
]);

export const RISK_AREA_SECTIONS = Object.freeze([
  {
    id: "jwla-034",
    regime: "JWC",
    label: "JWLA-034 Listed Areas",
    countLabel: "10 water layers · 22 country coasts · 1 call-only condition",
    description: "Current JWC Listed Areas grouped by official meaning, not by geometry implementation status.",
    defaultOpen: true,
    color: "#dc2626",
    subsections: JWLA_034_SUBSECTIONS,
  },

  {
    id: "ibf-itf",
    regime: "IBF/ITF",
    label: "IBF/ITF Crew Risk Areas",
    countLabel: "10 active · 1 withdrawn",
    description: "Crew employment and compensation regimes, separate from JWC. Official-current geometry verification in progress.",
    defaultOpen: false,
    color: "#a855f7",
    items: IBF_ITF_ITEMS,
  },
  {
    id: "iwl",
    regime: "IWL",
    label: "IWL Navigating Limits",
    description: "Contract navigating limits, separate from JWC. Clause geometry and seasonal status verification in progress.",
    defaultOpen: false,
    color: "#d97706",
    items: IWL_ITEMS,
  },
]);

export function getCalendarStatus(areaItem, at = new Date()) {
  if (areaItem?.ruleType === "YEAR_ROUND") return "ACTIVE";
  if (areaItem?.ruleType !== "SEASONAL" || !areaItem.seasonStart || !areaItem.seasonEnd) return "UNKNOWN";
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return "UNKNOWN";

  const monthDay = `${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
  const { seasonStart: start, seasonEnd: end } = areaItem;
  const active = start <= end
    ? monthDay >= start && monthDay <= end
    : monthDay >= start || monthDay <= end;
  return active ? "ACTIVE" : "INACTIVE";
}

export function allRiskAreaItems() {
  return RISK_AREA_SECTIONS.flatMap((section) => (
    section.subsections
      ? section.subsections.flatMap((subsection) => subsection.items)
      : section.items
  ));
}

export function groupSectionItems(section) {
  const grouped = new Map();
  for (const areaItem of section?.items || []) {
    const label = areaItem.group || "Other";
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(areaItem);
  }
  return [...grouped].map(([label, items]) => ({ label, items }));
}

export const JWLA_033_COMPARISON_KEY = "__jwla033ComparisonVisible";

export function migrateRiskAreaSettings(settings) {
  const current = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  if (current.__jwlaCatalogVersion === 3) return current;
  const next = {
    ...current,
    [JWLA_033_COMPARISON_KEY]: current[JWLA_033_COMPARISON_KEY] === true,
    __jwlaCurrentDefaultsVersion: 3,
    __jwlaCatalogVersion: 3,
  };

  const legacyCombined = current["JWLA 034 - Combined Middle East and Southern Red Sea Waters"];
  if (legacyCombined) {
    for (const areaItem of JWC_034_CURRENT_WATERS.filter(({ group }) => group === "Middle East & Southern Red Sea")) {
      const layerKey = areaItem.layerKeys[0];
      next[layerKey] = { ...getLayerDefaults(layerKey), ...legacyCombined, ...current[layerKey] };
    }
  }

  for (const areaItem of JWC_COUNTRIES) {
    const legacyLand = current[`JWLA 034 Country - ${areaItem.label}`];
    const explicitSettings = [legacyLand, ...areaItem.layerKeys.map((layerKey) => current[layerKey])]
      .filter((setting) => typeof setting?.visible === "boolean");
    if (explicitSettings.length === 0) continue;
    const visible = explicitSettings.some((setting) => setting.visible);
    const styleSource = current[areaItem.layerKeys[0]] || legacyLand || explicitSettings[0];
    for (const layerKey of areaItem.layerKeys) {
      next[layerKey] = {
        color: areaItem.color,
        opacity: areaItem.opacity,
        ...styleSource,
        ...current[layerKey],
        visible,
      };
    }
  }
  return next;
}

export function isComparisonModeEnabled(settings = {}) {
  return settings[JWLA_033_COMPARISON_KEY] === true;
}

export function setComparisonMode(settings = {}, visible) {
  return { ...settings, [JWLA_033_COMPARISON_KEY]: Boolean(visible) };
}

export function getComparisonLayerKeys() {
  return CONTRACT_ALERT_ITEMS.flatMap((areaItem) => areaItem.layerKeys);
}

export function shouldLoadSectionLayers(sectionId, settings = {}, focusKey = null) {
  const section = RISK_AREA_SECTIONS.flatMap((candidate) => (
    candidate.subsections ? [candidate, ...candidate.subsections] : [candidate]
  )).find((candidate) => candidate.id === sectionId);
  if (!section) return false;
  const items = section.subsections
    ? section.subsections.flatMap((subsection) => subsection.items)
    : section.items;
  return items.some((areaItem) => (
    areaItem.layerKeys?.includes(focusKey)
    || areaItem.layerKeys?.some((key) => settings[key]?.visible ?? areaItem.defaultVisible)
  ));
}

const VERIFIED_COASTAL_LAYER_KEYS = new Set([
  "JWLA 034 Coastal Waters - Syria 12NM",
  "JWLA 034 Coastal Waters - Russia 12NM",
  "JWLA 034 Coastal Waters - Israel 12NM",
  "JWLA 034 Coastal Waters - Lebanon 12NM",
]);
const PROVISIONAL_COASTAL_LAYER_KEYS = new Set(
  PROVISIONAL_COASTAL_SPECS.map(([, label]) => `JWLA 034 Coastal Waters - ${label} 12NM`),
);
const INSTALLATION_LAYER_KEYS = new Set([
  "JWLA 034 - Guyana Offshore Installation Reference",
  "JWLA 034 - Venezuela Offshore Installation Reference",
]);

function shouldLoadLayerKeys(layerKeys, settings = {}, focusKey = null) {
  if (layerKeys.has(focusKey)) return true;
  return [...layerKeys].some((key) => settings[key]?.visible ?? getLayerDefaults(key).visible);
}

export function shouldLoadCoastalLayers(settings = {}, focusKey = null) {
  return shouldLoadLayerKeys(VERIFIED_COASTAL_LAYER_KEYS, settings, focusKey);
}

export function shouldLoadInstallationLayers(settings = {}, focusKey = null) {
  return shouldLoadLayerKeys(INSTALLATION_LAYER_KEYS, settings, focusKey);
}

export function planCoastalLoadRequest({ settings = {}, focusKey = null, loaded = false } = {}) {
  const shouldLoad = shouldLoadCoastalLayers(settings, focusKey);
  const shouldRequest = shouldLoad && !loaded;
  return { shouldLoad, shouldRequest, urls: shouldRequest ? [COASTAL_URL] : [] };
}

export function planDefinedWaterLoadRequest({ settings = {}, focusKey = null, loaded = false } = {}) {
  const shouldLoad = shouldLoadSectionLayers("jwla-034-defined-waters", settings, focusKey);
  const shouldRequest = shouldLoad && !loaded;
  return { shouldLoad, shouldRequest, urls: shouldRequest ? [DEFINED_WATERS_URL] : [] };
}

export function planProvisionalCoastalLoadRequest({ settings = {}, focusKey = null, loaded = false } = {}) {
  const shouldLoad = shouldLoadLayerKeys(PROVISIONAL_COASTAL_LAYER_KEYS, settings, focusKey);
  const shouldRequest = shouldLoad && !loaded;
  return { shouldLoad, shouldRequest, urls: shouldRequest ? [PROVISIONAL_COASTAL_URL] : [] };
}

export function getFeatureBounds(feature) {
  const longitudes = [];
  let ordinaryWest = Infinity;
  let ordinaryEast = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      longitudes.push(((value[0] % 360) + 360) % 360);
      ordinaryWest = Math.min(ordinaryWest, value[0]);
      ordinaryEast = Math.max(ordinaryEast, value[0]);
      minLat = Math.min(minLat, value[1]);
      maxLat = Math.max(maxLat, value[1]);
      return;
    }
    value.forEach(visit);
  };
  visit(feature?.geometry?.coordinates);
  if (longitudes.length === 0 || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) return null;
  if (ordinaryEast - ordinaryWest <= 180) return [[minLat, ordinaryWest], [maxLat, ordinaryEast]];

  const sorted = [...new Set(longitudes)].sort((a, b) => a - b);
  let largestGap = -1;
  let arcStartIndex = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const next = index === sorted.length - 1 ? sorted[0] + 360 : sorted[index + 1];
    const gap = next - sorted[index];
    if (gap > largestGap) {
      largestGap = gap;
      arcStartIndex = (index + 1) % sorted.length;
    }
  }
  let west = sorted[arcStartIndex];
  let east = sorted[(arcStartIndex - 1 + sorted.length) % sorted.length];
  if (east < west || sorted.length === 1) east += 360;
  while (west > 180) { west -= 360; east -= 360; }
  return [[minLat, west], [maxLat, east]];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? escapeHtml(url.href) : null;
  } catch {
    return null;
  }
}

export function buildFeaturePopupContent(feature) {
  const properties = feature?.properties || {};
  const sourceUrl = safeExternalUrl(properties.sourceUrl);
  const licenseUrl = safeExternalUrl(properties.licenseUrl);
  const provenance = [properties.subsetStatus, properties.derivedStatus].filter(Boolean).map(escapeHtml).join(" · ");
  return [
    '<section role="region" aria-label="Risk area source and license">',
    `<strong>${escapeHtml(properties.name || "Risk area")}</strong>`,
    `<div>${escapeHtml(properties.geometryStatus || "reference")}</div>`,
    properties.attribution ? `<div>Attribution: ${escapeHtml(properties.attribution)}</div>` : "",
    sourceUrl ? `<div>Source: <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">source data</a></div>` : "",
    licenseUrl ? `<div>License: <a href="${licenseUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(properties.license || "license")}</a></div>` : "",
    provenance ? `<div>${provenance}</div>` : "",
    properties.manualReviewRequired ? "<div><strong>Manual review required before use.</strong></div>" : "",
    properties.contractAlertEligible === false ? "<div>Display only; not used for backend contract alerts.</div>" : "",
    "</section>",
  ].join("");
}

export function isItemVisible(settings, areaItem) {
  if (!areaItem.layerKeys?.length) return false;
  return areaItem.layerKeys.every((key) => {
    const stored = settings[key];
    return stored?.visible ?? areaItem.defaultVisible;
  });
}

export function applyItemVisibility(settings, areaItem, visible) {
  if (!areaItem.layerKeys?.length || areaItem.dataStatus !== "ready") return settings;
  const next = { ...settings };
  for (const key of areaItem.layerKeys) {
    next[key] = {
      color: areaItem.color,
      opacity: areaItem.opacity,
      ...settings[key],
      visible,
    };
  }
  return next;
}

export function applySectionAppearance(settings, section, patch) {
  const next = { ...settings };
  for (const areaItem of section?.items || []) {
    if (areaItem.dataStatus !== "ready" || !areaItem.layerKeys?.length) continue;
    for (const layerKey of areaItem.layerKeys) {
      next[layerKey] = {
        ...getLayerDefaults(layerKey),
        ...settings[layerKey],
        ...patch,
      };
    }
  }
  return next;
}

export function resetSectionAppearance(settings, section) {
  const next = { ...settings };
  for (const areaItem of section?.items || []) {
    if (areaItem.dataStatus !== "ready" || !areaItem.layerKeys?.length) continue;
    for (const layerKey of areaItem.layerKeys) {
      next[layerKey] = {
        ...settings[layerKey],
        color: areaItem.color,
        opacity: areaItem.opacity,
      };
    }
  }
  return next;
}

export function getLayerDefaults(layerKey) {
  const renderItems = [...allRiskAreaItems(), ...CONTRACT_ALERT_ITEMS];
  const areaItem = renderItems.find((candidate) => candidate.layerKeys?.includes(layerKey));
  if (!areaItem) return { visible: false, color: "#ef4444", opacity: 0.12 };
  return {
    visible: areaItem.defaultVisible,
    color: areaItem.color,
    opacity: areaItem.opacity,
  };
}
