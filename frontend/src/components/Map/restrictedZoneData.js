import {
  getLayerDefaults,
  isComparisonModeEnabled,
} from "../../riskAreas/riskAreaCatalog.js";

export function resolveFeatureSetting(zoneSettings = {}, feature = {}) {
  const properties = feature.properties || {};
  const name = properties.name || "";
  const defaults = getLayerDefaults(name);
  const configured = zoneSettings[name] || defaults;
  const isContractAlert = properties.mapKind === "contract-alert"
    || properties.monitoringMode === "backend-geofence"
    || properties.backendGeofence === true
    || (properties.contractAlertEligible === true && properties.mapKind !== "version-amendment");
  const isVersionAmendment = properties.mapKind === "version-amendment";

  if (isContractAlert || isVersionAmendment) {
    return {
      ...configured,
      visible: isComparisonModeEnabled(zoneSettings),
    };
  }
  return configured;
}

export function visibleFeatureCollection(collection, getSetting) {
  if (!collection) return null;
  return {
    ...collection,
    features: (collection.features || []).filter((feature) => getSetting(feature).visible),
  };
}

export function featureCollectionKey(prefix, collection) {
  const identifiers = (collection?.features || []).map((feature, index) => (
    feature.id || feature.properties?.name || index
  ));
  return `${prefix}:${identifiers.join("|")}`;
}
