import React from "react";
import { Polyline, Tooltip } from "react-leaflet";

/**
 * ShippingLaneLayer — 활성화된 표준 항로를 메인 지도에 표시
 *
 * 표시 스타일: 얇은 회색 점선 (참조용 느낌, 선박 항적과 구분)
 *
 * Props:
 *   lanes: ShippingLane[] — active 항로 목록 (coordinates: [[lon,lat], ...])
 */
export default function ShippingLaneLayer({ lanes }) {
  if (!lanes || lanes.length === 0) return null;

  return lanes.map((lane) => {
    // DB: [lon, lat] → Leaflet: [lat, lon]
    const positions = Array.isArray(lane.coordinates)
      ? lane.coordinates.map(([lon, lat]) => [lat, lon])
      : [];

    if (positions.length < 2) return null;

    return (
      <Polyline
        key={lane.id}
        positions={positions}
        pathOptions={{
          color: "#9ca3af",   // gray-400 — 참조용 회색
          weight: 1.25,       // 얇게 (기존 2.5의 절반)
          opacity: 0.65,
          dashArray: "8 5",
        }}
      >
        {/* hover 시 항로 이름 표시 (non-sticky: 클릭 시 나타나지 않음) */}
        <Tooltip direction="top" opacity={0.85}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
            🛣 {lane.name}
          </div>
          {lane.description && (
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
              {lane.description}
            </div>
          )}
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
            {Array.isArray(lane.coordinates) ? lane.coordinates.length : 0}개 웨이포인트
          </div>
        </Tooltip>
      </Polyline>
    );
  });
}
