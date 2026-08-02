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
const COASTAL_URL = "/risk-areas/jwla-034-coastal-waters.geojson";
const PROVISIONAL_COASTAL_URL = "/risk-areas/jwla-034-coastal-waters-provisional.geojson";

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

const JWC_034_CURRENT_WATERS = [
  item({
    id: "jwc-034-current-combined-waters",
    label: "Middle East & Southern Red Sea defined waters",
    layerKey: "JWLA 034 - Combined Middle East and Southern Red Sea Waters",
    badge: "CURRENT",
    note: "Current JWLA-034 informational reconstruction. Egyptian territorial waters use pinned approximate reference geometry.",
    defaultVisible: true,
    color: "#dc2626",
    opacity: 0.15,
  }),
  item({
    id: "jwc-034-current-black-sea",
    label: "Black Sea & Sea of Azov",
    layerKey: "JWLA 034 - Black Sea & Sea of Azov",
    badge: "CURRENT",
    note: "Current maritime reference boundary. The circular's Ukraine, Don, Donets and Belarus inland-water clauses remain incomplete.",
    defaultVisible: true,
    color: "#dc2626",
    opacity: 0.15,
  }),
  item({
    id: "jwc-034-current-gulf-guinea",
    label: "Gulf of Guinea",
    layerKey: "JWLA 034 - Gulf of Guinea",
    badge: "CURRENT",
    note: "Current anchor-based informational reconstruction; coastline closure remains approximate.",
    defaultVisible: true,
    color: "#dc2626",
    opacity: 0.15,
  }),
  item({
    id: "jwc-034-current-cabo-delgado",
    label: "Cabo Delgado",
    layerKey: "JWLA 034 - Cabo Delgado",
    badge: "CURRENT",
    note: "Current Tanzania and Mozambique coastline-buffer reference constrained by the circular's published limits.",
    defaultVisible: true,
    color: "#dc2626",
    opacity: 0.15,
  }),
  item({
    id: "jwc-034-coastal-syria",
    label: "Syria 12NM coastal waters",
    layerKey: "JWLA 034 Coastal Waters - Syria 12NM",
    badge: "HIGH-DETAIL",
    note: "Verified high-detail optional reference from Marine Regions Territorial Seas v4; display-only and not connected to backend contract alerts.",
    defaultVisible: false,
    color: "#dc2626",
    opacity: 0.1,
  }),
  item({
    id: "jwc-034-coastal-russia",
    label: "Russia 12NM coastal waters",
    layerKey: "JWLA 034 Coastal Waters - Russia 12NM",
    badge: "HIGH-DETAIL",
    note: "Verified high-detail optional reference from Marine Regions Territorial Seas v4; display-only and not connected to backend contract alerts.",
    defaultVisible: false,
    color: "#dc2626",
    opacity: 0.1,
  }),
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

export const JWC_034_PROVISIONAL_COASTAL = Object.freeze([
  ...PROVISIONAL_COASTAL_SPECS.map(([id, label]) => item({
    id: `jwc-034-coastal-${id}`,
    label: `${label} 12NM coastal waters`,
    layerKey: `JWLA 034 Coastal Waters - ${label} 12NM`,
    badge: "PROVISIONAL",
    note: "Provisional display-only coastal reference; manual review is required and this layer is not connected to backend contract alerts.",
    defaultVisible: false,
    color: "#f97316",
    opacity: 0.1,
  })),
  pending("jwc-034-coastal-israel", "Israel 12NM coastal waters", {
    badge: "WITHHELD",
    note: "Source geometry is withheld from display because validation failed; manual review is required.",
    sourceUrl: JWC_SOURCE,
    color: "#f97316",
    dataStatus: "manual-review",
  }),
  pending("jwc-034-coastal-lebanon", "Lebanon 12NM coastal waters", {
    badge: "WITHHELD",
    note: "Source geometry is withheld from display because validation failed; manual review is required.",
    sourceUrl: JWC_SOURCE,
    color: "#f97316",
    dataStatus: "manual-review",
  }),
]);

const JWC_034_AMENDMENTS = [
  item({
    id: "jwc-034-red-sea-northward-extension",
    label: "Red Sea northward extension · 18°N → 25.5°N",
    layerKey: "JWLA 034 Amendment - Red Sea 18N to 25.5N",
    badge: "034 NEW",
    note: "Only the area added north of the JWLA-033 18°N limit is shown. Egyptian territorial waters are excluded with approximate reference geometry.",
    defaultVisible: false,
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

export const RISK_AREA_SECTIONS = Object.freeze([
  {
    id: "jwc-034-current",
    regime: "JWC current reference",
    label: "JWLA-034 Current Defined Waters",
    countLabel: "4 defined waters · 2 verified coastal references",
    description: "Default informational view of the current circular. Known source-data limitations are stated per area; this layer does not change backend alerts.",
    defaultOpen: true,
    color: "#dc2626",
    items: JWC_034_CURRENT_WATERS,
  },
  {
    id: "jwc-034-provisional-coastal",
    regime: "JWC provisional reference",
    label: "JWLA-034 Provisional Coastal References",
    countLabel: "18 provisional · 2 withheld for manual review",
    description: "Optional display-only Marine Regions references. All require manual review and do not change backend alerts; Israel and Lebanon remain withheld.",
    defaultOpen: false,
    color: "#f97316",
    items: JWC_034_PROVISIONAL_COASTAL,
  },
  {
    id: "contract-alerts",
    regime: "JWLA-033 / Backend",
    label: "JWLA-033 Baseline Areas",
    countLabel: "22 areas · backend alert basis",
    description: "Optional JWLA-033-era/backend comparison. These exact boundaries are used by the backend entry/exit checker; display controls do not change server alert rules.",
    defaultOpen: false,
    color: "#ef4444",
    items: CONTRACT_ALERT_ITEMS,
  },
  {
    id: "jwc-034-amendment",
    regime: "JWC version delta",
    label: "JWLA-034 Added Area",
    countLabel: "1 northward extension",
    description: "Optional version-comparison overlay showing only the northward Red Sea expansion beyond the JWLA-033 baseline.",
    defaultOpen: false,
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

export function migrateRiskAreaSettings(settings) {
  const current = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  if (current.__jwlaCurrentDefaultsVersion === 1) return current;
  return { ...current, __jwlaCurrentDefaultsVersion: 1 };
}

export function shouldLoadSectionLayers(sectionId, settings = {}, focusKey = null) {
  const section = RISK_AREA_SECTIONS.find((candidate) => candidate.id === sectionId);
  if (!section) return false;
  return section.items.some((areaItem) => (
    areaItem.layerKeys?.includes(focusKey)
    || areaItem.layerKeys?.some((key) => settings[key]?.visible ?? areaItem.defaultVisible)
  ));
}

export function shouldLoadCoastalLayers(settings = {}, focusKey = null) {
  const coastalItems = JWC_034_CURRENT_WATERS.filter((areaItem) => areaItem.id.startsWith("jwc-034-coastal-"));
  return coastalItems.some((areaItem) => (
    areaItem.layerKeys.includes(focusKey)
    || areaItem.layerKeys.some((key) => settings[key]?.visible ?? areaItem.defaultVisible)
  ));
}

export function planCoastalLoadRequest({ settings = {}, focusKey = null, loaded = false } = {}) {
  const shouldLoad = shouldLoadCoastalLayers(settings, focusKey);
  const shouldRequest = shouldLoad && !loaded;
  return { shouldLoad, shouldRequest, urls: shouldRequest ? [COASTAL_URL] : [] };
}

export function planProvisionalCoastalLoadRequest({ settings = {}, focusKey = null, loaded = false } = {}) {
  const shouldLoad = shouldLoadSectionLayers("jwc-034-provisional-coastal", settings, focusKey);
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
  const areaItem = allRiskAreaItems().find((candidate) => candidate.layerKeys?.includes(layerKey));
  if (!areaItem) return { visible: false, color: "#ef4444", opacity: 0.12 };
  return {
    visible: areaItem.defaultVisible,
    color: areaItem.color,
    opacity: areaItem.opacity,
  };
}
