import React, { useEffect, useState, useRef } from "react";
import { GeoJSON } from "react-leaflet";

/**
 * Persian Gulf + Gulf of Oman 제한 해역 오버레이
 * 데이터 출처: Marine Regions / IHO Sea Areas (해안선 정밀 클리핑)
 */
export default function RestrictedZone({ visible = true, opacityValue = 0.15, selectedRegions, toggleSelectedRegion }) {
  const [geoData, setGeoData] = useState(null);
  const [territorialData, setTerritorialData] = useState(null);

  const geoRef = useRef(null);
  const territorialRef = useRef(null);

  useEffect(() => {
    fetch("/war-risk-zone.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch((e) => console.error("War risk zone load error:", e));

    fetch("/12nm_bounds.geojson")
      .then((r) => r.json())
      .then(setTerritorialData)
      .catch((e) => console.error("12NM boundary load error:", e));
  }, []);

  const getStyle = (feature) => {
    let featureOpacity = opacityValue;
    if (selectedRegions && selectedRegions.length > 0) {
      if (feature.properties && selectedRegions.includes(feature.properties.name)) {
         featureOpacity = opacityValue;
      } else {
         featureOpacity = 0.15;
      }
    }
    return {
      color: "#ef4444",
      weight: 1.5,
      opacity: Math.min(1, featureOpacity + 0.35),
      fillColor: "#ef4444",
      fillOpacity: featureOpacity,
      dashArray: "6, 4",
    };
  };

  useEffect(() => {
    if (geoRef.current) {
        geoRef.current.setStyle(getStyle);
    }
    if (territorialRef.current) {
        territorialRef.current.setStyle(getStyle);
    }
  }, [selectedRegions, opacityValue]);

  if (!visible) return null;

  return (
    <>
      {geoData && (
        <GeoJSON
          ref={geoRef}
          key={`jwc-${JSON.stringify(geoData.features?.length || geoData)}`}
          data={geoData}
          onEachFeature={(feature, layer) => {
            layer.on("click", (e) => {
              if (feature.properties && feature.properties.name) {
                toggleSelectedRegion(feature.properties.name);
              }
            });
          }}
          style={getStyle}
        />
      )}
      {territorialData && (
        <GeoJSON
          ref={territorialRef}
          key={`12nm-${JSON.stringify(territorialData.features?.length || territorialData)}`}
          data={territorialData}
          onEachFeature={(feature, layer) => {
            layer.on("click", (e) => {
              if (feature.properties && feature.properties.name) {
                toggleSelectedRegion(feature.properties.name);
              }
            });
          }}
          style={getStyle}
        />
      )}
    </>
  );
}
