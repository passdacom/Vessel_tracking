import React, { useEffect, useState, useRef, useCallback } from "react";
import { GeoJSON } from "react-leaflet";
import { DEFAULT_ZONE, COUNTRY_DEFAULT_ZONE } from "../ZoneSettingsPanel.jsx";

/**
 * War Risk Zone + 12NM Territorial Waters + Country HRA 오버레이
 * zoneSettings: { [featureName]: { visible, color, opacity } }
 */
export default function RestrictedZone({ zoneSettings = {} }) {
  const [geoData, setGeoData] = useState(null);
  const [territorialData, setTerritorialData] = useState(null);
  const [globalData, setGlobalData] = useState(null);
  const [countriesData, setCountriesData] = useState(null);

  const geoRef = useRef(null);
  const territorialRef = useRef(null);
  const globalRef = useRef(null);
  const countriesRef = useRef(null);

  useEffect(() => {
    fetch("/war-risk-zone.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch((e) => console.error("War risk zone load error:", e));

    fetch("/12nm_bounds.geojson")
      .then((r) => r.json())
      .then(setTerritorialData)
      .catch((e) => console.error("12NM boundary load error:", e));

    fetch("/war-risk-zone-global.geojson")
      .then((r) => r.json())
      .then(setGlobalData)
      .catch((e) => console.error("Global war risk zone load error:", e));

    fetch("/war-risk-countries.geojson")
      .then((r) => r.json())
      .then(setCountriesData)
      .catch((e) => console.error("Country HRA zone load error:", e));
  }, []);

  const getSetting = useCallback((name) => {
    return { ...DEFAULT_ZONE, ...zoneSettings[name] };
  }, [zoneSettings]);

  const getCountrySetting = useCallback((name) => {
    return { ...COUNTRY_DEFAULT_ZONE, ...zoneSettings[name] };
  }, [zoneSettings]);

  const getStyle = useCallback((feature) => {
    const name = feature.properties?.name;
    const s = getSetting(name);
    if (!s.visible) return { opacity: 0, fillOpacity: 0, weight: 0 };
    return {
      color: s.color,
      weight: 1.5,
      opacity: Math.min(1, s.opacity + 0.35),
      fillColor: s.color,
      fillOpacity: s.opacity,
      dashArray: "6, 4",
    };
  }, [getSetting]);

  const getCountryStyle = useCallback((feature) => {
    const name = feature.properties?.name;
    const s = getCountrySetting(name);
    if (!s.visible) return { opacity: 0, fillOpacity: 0, weight: 0 };
    return {
      color: s.color,
      weight: 1,
      opacity: Math.min(1, s.opacity + 0.25),
      fillColor: s.color,
      fillOpacity: s.opacity,
      dashArray: "3, 6",
    };
  }, [getCountrySetting]);

  // zoneSettings 변경 시 스타일 재적용
  useEffect(() => {
    if (geoRef.current) geoRef.current.setStyle(getStyle);
    if (territorialRef.current) territorialRef.current.setStyle(getStyle);
    if (globalRef.current) globalRef.current.setStyle(getStyle);
    if (countriesRef.current) countriesRef.current.setStyle(getCountryStyle);
  }, [zoneSettings, getStyle, getCountryStyle]);

  // 모든 zone이 숨겨져 있으면 렌더링 스킵
  const anyVisible = Object.values(zoneSettings).some((s) => s.visible !== false);
  if (Object.keys(zoneSettings).length > 0 && !anyVisible) return null;

  return (
    <>
      {/* 국가 HRA 레이어 — 맨 아래(먼저 렌더링)로 해역 레이어가 위에 표시 */}
      {countriesData && (
        <GeoJSON
          ref={countriesRef}
          key={`countries-${countriesData.features?.length || 0}`}
          data={countriesData}
          style={getCountryStyle}
        />
      )}
      {geoData && (
        <GeoJSON
          ref={geoRef}
          key={`jwc-${geoData.features?.length || 0}`}
          data={geoData}
          style={getStyle}
        />
      )}
      {territorialData && (
        <GeoJSON
          ref={territorialRef}
          key={`12nm-${territorialData.features?.length || 0}`}
          data={territorialData}
          style={getStyle}
        />
      )}
      {globalData && (
        <GeoJSON
          ref={globalRef}
          key={`global-${globalData.features?.length || 0}`}
          data={globalData}
          style={getStyle}
        />
      )}
    </>
  );
}
