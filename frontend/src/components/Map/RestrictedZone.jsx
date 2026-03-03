import React, { useEffect, useState } from "react";
import { GeoJSON, Tooltip } from "react-leaflet";

/**
 * Persian Gulf + Gulf of Oman 제한 해역 오버레이
 * 데이터 출처: Marine Regions / IHO Sea Areas (해안선 정밀 클리핑)
 */
export default function RestrictedZone({ visible = true }) {
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    fetch("/war-risk-zone.geojson")
      .then((r) => r.json())
      .then(setGeoData)
      .catch((e) => console.error("War risk zone load error:", e));
  }, []);

  if (!visible || !geoData) return null;

  return (
    <GeoJSON
      key={JSON.stringify(geoData)}
      data={geoData}
      style={{
        color: "#ef4444",
        weight: 1.5,
        opacity: 0.5,
        fillColor: "#ef4444",
        fillOpacity: 0.15,
        dashArray: "6, 4",
      }}
      onEachFeature={(feature, layer) => {
        layer.bindTooltip(
          `<b>⚠️ War Risk Zone</b><br/>${feature.properties?.name || "Persian Gulf / Gulf of Oman"}`,
          { sticky: true }
        );
      }}
    />
  );
}
