import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, useMap } from "react-leaflet";
import {
  buildFeaturePopupContent,
  getFeatureBounds,
  isComparisonModeEnabled,
  planCoastalLoadRequest,
  planDefinedWaterLoadRequest,
  planProvisionalCoastalLoadRequest,
  shouldLoadInstallationLayers,
  shouldLoadSectionLayers,
} from "../../riskAreas/riskAreaCatalog.js";
import {
  featureCollectionKey,
  resolveFeatureSetting,
  visibleFeatureCollection,
} from "./restrictedZoneData.js";

const AMENDMENT_URL = "/risk-areas/jwla-034-amendments.geojson";
const COUNTRY_URL = "/risk-areas/jwla-034-countries.geojson";
const INSTALLATION_URL = "/risk-areas/jwla-034-installations.geojson";

const CONTRACT_ALERT_URLS = [
  "/war-risk-zone.geojson",
  "/12nm_bounds.geojson",
  "/war-risk-zone-global.geojson",
];


function featureByName(collections, name) {
  for (const collection of collections) {
    const feature = collection?.features?.find((candidate) => candidate.properties?.name === name);
    if (feature) return feature;
  }
  return null;
}


/**
 * Current JWLA-034 informational reference with optional version/backend layers.
 *
 * These layers intentionally do not feed the backend geofence checker. The current
 * reference map and contract alert rules have different version/effective-date semantics.
 */
export default function RestrictedZone({ zoneSettings = {}, focusArea }) {
  const map = useMap();
  const [areas, setAreas] = useState(null);
  const [coastal, setCoastal] = useState(null);
  const [provisionalCoastal, setProvisionalCoastal] = useState(null);

  const [amendments, setAmendments] = useState(null);
  const [countries, setCountries] = useState(null);
  const [installations, setInstallations] = useState(null);
  const [contractAlerts, setContractAlerts] = useState(null);
  const areaRef = useRef(null);
  const coastalRef = useRef(null);
  const provisionalCoastalRef = useRef(null);

  const amendmentRef = useRef(null);
  const countryRef = useRef(null);
  const installationRef = useRef(null);
  const contractAlertRef = useRef(null);

  const definedWaterLoadPlan = planDefinedWaterLoadRequest({
    settings: zoneSettings,
    focusKey: focusArea?.key,
    loaded: Boolean(areas),
  });
  const definedWaterRequestUrl = definedWaterLoadPlan.urls[0];

  useEffect(() => {
    if (!definedWaterLoadPlan.shouldRequest || !definedWaterRequestUrl) return undefined;
    const controller = new AbortController();
    const loadAreas = async () => {
      try {
        const response = await fetch(definedWaterRequestUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const collection = await response.json();
        setAreas({
          ...collection,
          features: (collection.features || []).filter((feature) => feature.properties?.scope === "defined-waters"),
        });
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 current reference load error:", error);
      }
    };
    loadAreas();
    return () => controller.abort();
  }, [definedWaterLoadPlan.shouldRequest, definedWaterRequestUrl]);

  const shouldLoadCountries = shouldLoadSectionLayers("jwla-034-named-countries", zoneSettings, focusArea?.key);
  const coastalLoadPlan = planCoastalLoadRequest({
    settings: zoneSettings,
    focusKey: focusArea?.key,
    loaded: Boolean(coastal),
  });
  const coastalRequestUrl = coastalLoadPlan.urls[0];
  const provisionalCoastalLoadPlan = planProvisionalCoastalLoadRequest({
    settings: zoneSettings,
    focusKey: focusArea?.key,
    loaded: Boolean(provisionalCoastal),
  });
  const provisionalCoastalRequestUrl = provisionalCoastalLoadPlan.urls[0];
  const comparisonVisible = isComparisonModeEnabled(zoneSettings);
  const shouldLoadAmendments = comparisonVisible;
  const shouldLoadInstallations = shouldLoadInstallationLayers(zoneSettings, focusArea?.key);
  const shouldLoadContractAlerts = comparisonVisible;

  useEffect(() => {
    if (!coastalLoadPlan.shouldRequest || !coastalRequestUrl) return undefined;
    const controller = new AbortController();
    const loadCoastal = async () => {
      try {
        const response = await fetch(coastalRequestUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setCoastal(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 coastal reference load error:", error);
      }
    };
    loadCoastal();
    return () => controller.abort();
  }, [coastalLoadPlan.shouldRequest, coastalRequestUrl]);

  useEffect(() => {
    if (!provisionalCoastalLoadPlan.shouldRequest || !provisionalCoastalRequestUrl) return undefined;
    const controller = new AbortController();
    const loadProvisionalCoastal = async () => {
      try {
        const response = await fetch(provisionalCoastalRequestUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setProvisionalCoastal(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 provisional coastal reference load error:", error);
      }
    };
    loadProvisionalCoastal();
    return () => controller.abort();
  }, [provisionalCoastalLoadPlan.shouldRequest, provisionalCoastalRequestUrl]);


  useEffect(() => {
    if (!shouldLoadAmendments || amendments) return undefined;
    const controller = new AbortController();
    const loadAmendments = async () => {
      try {
        const response = await fetch(AMENDMENT_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setAmendments(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 amendment load error:", error);
      }
    };
    loadAmendments();
    return () => controller.abort();
  }, [shouldLoadAmendments, amendments]);

  useEffect(() => {
    if (!shouldLoadCountries || countries) return undefined;
    const controller = new AbortController();
    const loadCountries = async () => {
      try {
        const response = await fetch(COUNTRY_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setCountries(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 country reference load error:", error);
      }
    };
    loadCountries();
    return () => controller.abort();
  }, [shouldLoadCountries, countries]);

  useEffect(() => {
    if (!shouldLoadInstallations || installations) return undefined;
    const controller = new AbortController();
    const loadInstallations = async () => {
      try {
        const response = await fetch(INSTALLATION_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setInstallations(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 installation reference load error:", error);
      }
    };
    loadInstallations();
    return () => controller.abort();
  }, [shouldLoadInstallations, installations]);

  useEffect(() => {
    if (!shouldLoadContractAlerts || contractAlerts) return undefined;
    const controller = new AbortController();
    const loadContractAlerts = async () => {
      try {
        const responses = await Promise.all(CONTRACT_ALERT_URLS.map((url) => fetch(url, { signal: controller.signal })));
        const failed = responses.find((response) => !response.ok);
        if (failed) throw new Error(`${failed.status} ${failed.statusText}`);
        const collections = await Promise.all(responses.map((response) => response.json()));
        setContractAlerts({
          type: "FeatureCollection",
          features: collections.flatMap((collection, index) => (
            (collection.features || []).map((feature) => ({
              ...feature,
              properties: {
                ...feature.properties,
                mapKind: "contract-alert",
                monitoringMode: "backend-geofence",
                geometryStatus: `backend input · ${CONTRACT_ALERT_URLS[index].slice(1)}`,
              },
            }))
          )),
        });
      } catch (error) {
        if (error.name !== "AbortError") console.error("Contract alert boundary load error:", error);
      }
    };
    loadContractAlerts();
    return () => controller.abort();
  }, [shouldLoadContractAlerts, contractAlerts]);

  const getSetting = useCallback((feature) => (
    resolveFeatureSetting(zoneSettings, feature)
  ), [zoneSettings]);

  const getStyle = useCallback((feature) => {
    const setting = getSetting(feature);
    if (!setting.visible) return { opacity: 0, fillOpacity: 0, weight: 0, interactive: false };
    const isReferenceOnly = feature.properties?.monitoringMode === "reference-only";
    const isContractAlert = feature.properties?.monitoringMode === "backend-geofence";
    const isInstallationContext = feature.properties?.geometryRole === "installation-context-only"
      || feature.properties?.scope === "installation-context-only";
    return {
      color: setting.color,
      weight: isContractAlert ? 2 : isReferenceOnly ? 1 : 1.5,
      opacity: Math.min(1, setting.opacity + 0.35),
      fillColor: setting.color,
      fillOpacity: isInstallationContext ? 0 : setting.opacity,
      dashArray: isContractAlert ? "2, 5" : isReferenceOnly ? "2, 7" : "6, 4",
      interactive: true,
    };
  }, [getSetting]);

  const onEachFeature = useCallback((feature, layer) => {
    const name = feature.properties?.name || "Risk area";
    const status = feature.properties?.geometryStatus || "reference";
    const tooltip = document.createElement("span");
    tooltip.textContent = `${name} · ${status}`;
    layer.bindTooltip(tooltip, { sticky: true, direction: "top" });
    layer.bindPopup(buildFeaturePopupContent(feature), { maxWidth: 360 });
  }, []);

  const visibleContractAlerts = useMemo(
    () => visibleFeatureCollection(contractAlerts, getSetting),
    [contractAlerts, getSetting],
  );
  const visibleCountries = useMemo(
    () => visibleFeatureCollection(countries, getSetting),
    [countries, getSetting],
  );
  const visibleInstallations = useMemo(
    () => visibleFeatureCollection(installations, getSetting),
    [installations, getSetting],
  );
  const visibleAreas = useMemo(
    () => visibleFeatureCollection(areas, getSetting),
    [areas, getSetting],
  );
  const visibleCoastal = useMemo(
    () => visibleFeatureCollection(coastal, getSetting),
    [coastal, getSetting],
  );
  const visibleProvisionalCoastal = useMemo(
    () => visibleFeatureCollection(provisionalCoastal, getSetting),
    [provisionalCoastal, getSetting],
  );
  const visibleAmendments = useMemo(
    () => visibleFeatureCollection(amendments, getSetting),
    [amendments, getSetting],
  );

  useEffect(() => {
    areaRef.current?.setStyle(getStyle);
    coastalRef.current?.setStyle(getStyle);
    provisionalCoastalRef.current?.setStyle(getStyle);

    amendmentRef.current?.setStyle(getStyle);
    countryRef.current?.setStyle(getStyle);
    installationRef.current?.setStyle(getStyle);
    contractAlertRef.current?.setStyle(getStyle);
  }, [zoneSettings, getStyle]);

  useEffect(() => {
    if (!focusArea?.key) return;
    const feature = featureByName([areas, coastal, provisionalCoastal, amendments, countries, installations, contractAlerts], focusArea.key);
    const bounds = getFeatureBounds(feature);
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 7, animate: true });
  }, [focusArea, areas, coastal, provisionalCoastal, amendments, countries, installations, contractAlerts, map]);

  return (
    <>
      {visibleContractAlerts?.features.length > 0 && (
        <GeoJSON
          ref={contractAlertRef}
          key={featureCollectionKey("contract-alerts", visibleContractAlerts)}
          data={visibleContractAlerts}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {visibleCountries?.features.length > 0 && (
        <GeoJSON
          ref={countryRef}
          key={featureCollectionKey("jwla034-countries", visibleCountries)}
          data={visibleCountries}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {visibleInstallations?.features.length > 0 && (
        <GeoJSON
          ref={installationRef}
          key={featureCollectionKey("jwla034-installations", visibleInstallations)}
          data={visibleInstallations}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {visibleAreas?.features.length > 0 && (
        <GeoJSON
          ref={areaRef}
          key={featureCollectionKey("jwla034-current", visibleAreas)}
          data={visibleAreas}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {visibleCoastal?.features.length > 0 && (
        <GeoJSON
          ref={coastalRef}
          key={featureCollectionKey("jwla034-coastal", visibleCoastal)}
          data={visibleCoastal}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {visibleProvisionalCoastal?.features.length > 0 && (
        <GeoJSON
          ref={provisionalCoastalRef}
          key={featureCollectionKey("jwla034-provisional-coastal", visibleProvisionalCoastal)}
          data={visibleProvisionalCoastal}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {visibleAmendments?.features.length > 0 && (
        <GeoJSON
          ref={amendmentRef}
          key={featureCollectionKey("jwla034-amendments", visibleAmendments)}
          data={visibleAmendments}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
    </>
  );
}
