import React, { useCallback, useEffect, useRef, useState } from "react";
import { GeoJSON, useMap } from "react-leaflet";
import { getLayerDefaults, shouldLoadSectionLayers } from "../../riskAreas/riskAreaCatalog.js";

const AREA_URL = "/risk-areas/jwla-034-reference.geojson";
const COUNTRY_URL = "/risk-areas/jwla-034-countries.geojson";
const CONTRACT_ALERT_URLS = [
  "/war-risk-zone.geojson",
  "/12nm_bounds.geojson",
  "/war-risk-zone-global.geojson",
];

function getBounds(feature) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      minLon = Math.min(minLon, value[0]);
      maxLon = Math.max(maxLon, value[0]);
      minLat = Math.min(minLat, value[1]);
      maxLat = Math.max(maxLat, value[1]);
      return;
    }
    value.forEach(visit);
  };

  visit(feature?.geometry?.coordinates);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return null;
  return [[minLat, minLon], [maxLat, maxLon]];
}

function featureByName(collections, name) {
  for (const collection of collections) {
    const feature = collection?.features?.find((candidate) => candidate.properties?.name === name);
    if (feature) return feature;
  }
  return null;
}

/**
 * JWLA-034 current-reference overlay.
 *
 * These layers intentionally do not feed the backend geofence checker. The current
 * reference map and contract alert rules have different version/effective-date semantics.
 */
export default function RestrictedZone({ zoneSettings = {}, focusArea }) {
  const map = useMap();
  const [areas, setAreas] = useState(null);
  const [countries, setCountries] = useState(null);
  const [contractAlerts, setContractAlerts] = useState(null);
  const areaRef = useRef(null);
  const countryRef = useRef(null);
  const contractAlertRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadAreas = async () => {
      try {
        const response = await fetch(AREA_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        setAreas(await response.json());
      } catch (error) {
        if (error.name !== "AbortError") console.error("JWLA-034 area reference load error:", error);
      }
    };
    loadAreas();
    return () => controller.abort();
  }, []);

  const shouldLoadCountries = shouldLoadSectionLayers("jwc-countries", zoneSettings, focusArea?.key);
  const shouldLoadContractAlerts = shouldLoadSectionLayers("contract-alerts", zoneSettings, focusArea?.key);

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

  const getSetting = useCallback((name) => ({
    ...getLayerDefaults(name),
    ...zoneSettings[name],
  }), [zoneSettings]);

  const getStyle = useCallback((feature) => {
    const name = feature.properties?.name;
    const setting = getSetting(name);
    if (!setting.visible) return { opacity: 0, fillOpacity: 0, weight: 0, interactive: false };
    const isReferenceOnly = feature.properties?.monitoringMode === "reference-only";
    const isContractAlert = feature.properties?.monitoringMode === "backend-geofence";
    return {
      color: setting.color,
      weight: isContractAlert ? 2 : isReferenceOnly ? 1 : 1.5,
      opacity: Math.min(1, setting.opacity + 0.35),
      fillColor: setting.color,
      fillOpacity: setting.opacity,
      dashArray: isContractAlert ? "2, 5" : isReferenceOnly ? "2, 7" : "6, 4",
      interactive: true,
    };
  }, [getSetting]);

  const onEachFeature = useCallback((feature, layer) => {
    const name = feature.properties?.name || "Risk area";
    const status = feature.properties?.geometryStatus || "reference";
    layer.bindTooltip(`${name} · ${status}`, { sticky: true, direction: "top" });
  }, []);

  useEffect(() => {
    areaRef.current?.setStyle(getStyle);
    countryRef.current?.setStyle(getStyle);
    contractAlertRef.current?.setStyle(getStyle);
  }, [zoneSettings, getStyle]);

  useEffect(() => {
    if (!focusArea?.key) return;
    const feature = featureByName([areas, countries, contractAlerts], focusArea.key);
    const bounds = getBounds(feature);
    if (bounds) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 7, animate: true });
  }, [focusArea, areas, countries, contractAlerts, map]);

  return (
    <>
      {contractAlerts && (
        <GeoJSON
          ref={contractAlertRef}
          key={`contract-alerts-${contractAlerts.features?.length || 0}`}
          data={contractAlerts}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {countries && (
        <GeoJSON
          ref={countryRef}
          key={`jwla034-countries-${countries.features?.length || 0}`}
          data={countries}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
      {areas && (
        <GeoJSON
          ref={areaRef}
          key={`jwla034-areas-${areas.features?.length || 0}`}
          data={areas}
          style={getStyle}
          onEachFeature={onEachFeature}
        />
      )}
    </>
  );
}
