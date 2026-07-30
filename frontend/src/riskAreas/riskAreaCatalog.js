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

const item = ({
  id,
  label,
  layerKey,
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
  layerKeys: layerKey ? [layerKey] : [],
  badge,
  note,
  defaultVisible,
  color,
  opacity,
  sourceUrl,
  dataStatus,
  ...metadata,
});

const country = (id, label, group) => ({
  ...item({
    id: `jwc-country-${id}`,
    label,
    layerKey: `JWLA 034 Country - ${label}`,
    badge: "12NM",
    note: "Named Country reference outline. The listed scope is ports and coastal waters up to 12 nautical miles, not the whole land territory.",
    color: "#f97316",
    opacity: 0.04,
  }),
  group,
});

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

const JWC_034_AMENDMENTS = [
  item({
    id: "jwc-034-red-sea-northward-extension",
    label: "Red Sea northward extension · 18°N → 25.5°N",
    layerKey: "JWLA 034 Amendment - Red Sea 18N to 25.5N",
    badge: "034 NEW",
    note: "Only the area added north of the JWLA-033 18°N limit is shown. Egyptian territorial waters are excluded with approximate reference geometry.",
    defaultVisible: true,
    color: "#facc15",
    opacity: 0.22,
    mapKind: "version-amendment",
  }),
];

const JWC_INSTALLATIONS = [
  item({
    id: "jwc-guyana-installations",
    label: "Guyana — offshore installation calls",
    layerKey: "JWLA 034 - Guyana Offshore Installation Reference",
    badge: "CALLS",
    note: "Reference footprint only. JWLA-034 applies only to calls to offshore installations beyond territorial waters; simple EEZ transit is not an entry alert.",
    color: "#fb7185",
    opacity: 0.05,
  }),
  item({
    id: "jwc-venezuela-installations",
    label: "Venezuela — country & offshore installations",
    layerKey: "JWLA 034 - Venezuela Offshore Installation Reference",
    badge: "REF",
    note: "Reference footprint only. Offshore-installation visits require separate visit logic; the EEZ is not a blanket geofence.",
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
  country("guyana", "Guyana", "South America"),
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
    defaultVisible: true,
    color: "#38bdf8",
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

export const RISK_AREA_SECTIONS = Object.freeze([
  {
    id: "contract-alerts",
    regime: "JWLA-033 / Backend",
    label: "JWLA-033 Baseline Areas",
    countLabel: "22 areas · backend alert basis",
    description: "Restored JWLA-033-era map baseline. These exact boundaries are also used by the backend entry/exit checker; display controls do not change server alert rules.",
    defaultOpen: false,
    color: "#38bdf8",
    items: CONTRACT_ALERT_ITEMS,
  },
  {
    id: "jwc-034-amendment",
    regime: "JWC version delta",
    label: "JWLA-034 Added Area",
    countLabel: "1 northward extension",
    description: "Only the northward Red Sea expansion beyond the JWLA-033 baseline is overlaid, so old and new boundaries remain visually distinguishable.",
    defaultOpen: true,
    color: "#facc15",
    items: JWC_034_AMENDMENTS,
  },
  {
    id: "jwc-installations",
    regime: "JWC",
    label: "Offshore Installation Calls",
    description: "Reference areas only; installation visits require separate visit confirmation.",
    defaultOpen: false,
    color: "#fb7185",
    items: JWC_INSTALLATIONS,
  },
  {
    id: "jwc-countries",
    regime: "JWC",
    label: "JWC Named Countries",
    description: "Reference outlines; named countries mean ports and coastal waters up to 12NM unless varied.",
    defaultOpen: false,
    color: "#f97316",
    items: JWC_COUNTRIES,
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
  return RISK_AREA_SECTIONS.flatMap((section) => section.items);
}

export function shouldLoadSectionLayers(sectionId, settings = {}, focusKey = null) {
  const section = RISK_AREA_SECTIONS.find((candidate) => candidate.id === sectionId);
  if (!section) return false;
  return section.items.some((areaItem) => (
    areaItem.layerKeys?.includes(focusKey)
    || areaItem.layerKeys?.some((key) => settings[key]?.visible ?? areaItem.defaultVisible)
  ));
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

export function getLayerDefaults(layerKey) {
  const areaItem = allRiskAreaItems().find((candidate) => candidate.layerKeys?.includes(layerKey));
  if (!areaItem) return { visible: false, color: "#ef4444", opacity: 0.12 };
  return {
    visible: areaItem.defaultVisible,
    color: areaItem.color,
    opacity: areaItem.opacity,
  };
}
