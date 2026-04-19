/**
 * etaCalc.js — 선박 위치 → 목적지 거리/ETA 계산 (Turf.js 기반)
 *
 * 알고리즘:
 *   1. 각 active lane에 대해:
 *      a. 선박 위치 → lane snap (nearestPointOnLine)
 *      b. 목적지 → lane snap (nearestPointOnLine)
 *      c. lane 위 두 snap 사이 거리 (|location_d - location_v|)
 *      d. 총 거리 = dist(vessel, snapV) + laneSegment + dist(snapD, dest)
 *   2. 총 거리가 가장 작은 lane 선택
 *   3. 적합한 lane 없으면 Haversine 직선 거리로 fallback
 *   4. 예상 시간 = 총 거리 / 유효 SOG (SOG < 0.5kn이면 12kn 기본값)
 */

import * as turf from "@turf/turf";

const DEFAULT_SOG_KN = 12; // SOG 없을 때 기본 속력 (knots)

/**
 * @param {object} vessel       - { id, name, ... }
 * @param {object} vesselPos    - { lat, lon, sog }
 * @param {{ lat: number, lon: number }} destination
 * @param {Array}  lanes        - ShippingLane[] with .coordinates [[lon,lat],...]
 * @returns {EtaResult}
 */
export function calcEta(vesselPos, destination, lanes, options = {}) {
  if (!vesselPos || !destination) return null;

  const vPt = turf.point([vesselPos.lon, vesselPos.lat]);
  const dPt = turf.point([destination.lon, destination.lat]);
  // options.overrideSog: 명시적 속도 지정 시 사용
  const effectiveSog = options.overrideSog
    ? options.overrideSog
    : (vesselPos.sog && vesselPos.sog > 0.5 ? vesselPos.sog : DEFAULT_SOG_KN);

  let best = null;

  for (const lane of lanes) {
    if (!Array.isArray(lane.coordinates) || lane.coordinates.length < 2) continue;

    try {
      const line = turf.lineString(lane.coordinates); // already [lon, lat]

      const snapV = turf.nearestPointOnLine(line, vPt, { units: "nauticalmiles" });
      const snapD = turf.nearestPointOnLine(line, dPt, { units: "nauticalmiles" });

      const distVToSnap = snapV.properties.dist;   // nm: vessel → lane entry
      const distDToSnap = snapD.properties.dist;   // nm: dest → lane exit
      const laneSegDist = Math.abs(
        (snapD.properties.location ?? 0) - (snapV.properties.location ?? 0)
      );

      const total = distVToSnap + laneSegDist + distDToSnap;

      if (!best || total < best.total) {
        best = {
          total,
          distVToSnap: Math.round(distVToSnap * 10) / 10,
          laneSegDist: Math.round(laneSegDist * 10) / 10,
          distDToSnap: Math.round(distDToSnap * 10) / 10,
          laneId: lane.id,
          laneName: lane.name,
          laneColor: lane.color || "#f59e0b",
          snapVCoords: snapV.geometry.coordinates,   // [lon, lat]
          snapDCoords: snapD.geometry.coordinates,   // [lon, lat]
          laneCoordinates: lane.coordinates,
          laneSnapVIdx: snapV.properties.index ?? 0,
          laneSnapDIdx: snapD.properties.index ?? 0,
          usedFallback: false,
        };
      }
    } catch (_) {
      // 잘못된 좌표 데이터가 있는 lane은 스킵
    }
  }

  // fallback: 직선 Haversine
  if (!best) {
    const straightDist = turf.distance(vPt, dPt, { units: "nauticalmiles" });
    const rounded = Math.round(straightDist * 10) / 10;
    const hours = rounded / effectiveSog;
    return {
      total: rounded,
      distVToSnap: 0,
      laneSegDist: 0,
      distDToSnap: rounded,
      laneId: null,
      laneName: null,
      laneColor: null,
      snapVCoords: null,
      snapDCoords: null,
      laneCoordinates: null,
      usedFallback: true,
      effectiveSog,
      hours,
      eta: hoursToEta(hours),
    };
  }

  const hours = best.total / effectiveSog;
  return {
    ...best,
    total: Math.round(best.total * 10) / 10,
    effectiveSog,
    hours,
    eta: hoursToEta(hours),
  };
}

/**
 * lane 위의 vessel snap → dest snap 구간 좌표 추출 (지도 렌더링용)
 * 반환: [[lon,lat], ...] (GeoJSON 순서)
 */
export function extractLaneSegment(result) {
  if (!result || result.usedFallback || !result.laneCoordinates) return null;
  const { laneCoordinates, snapVCoords, snapDCoords } = result;

  try {
    const line = turf.lineString(laneCoordinates);
    const ptV = turf.point(snapVCoords);
    const ptD = turf.point(snapDCoords);

    // lineSlice는 방향에 관계없이 두 점 사이 구간 반환
    const locV = turf.nearestPointOnLine(line, ptV).properties.location;
    const locD = turf.nearestPointOnLine(line, ptD).properties.location;

    // 진행 방향: vessel → destination (locV < locD 방향으로 슬라이스)
    const [start, end] = locV <= locD ? [ptV, ptD] : [ptD, ptV];
    const segment = turf.lineSlice(start, end, line);
    return segment.geometry.coordinates; // [[lon,lat], ...]
  } catch (_) {
    return null;
  }
}

function hoursToEta(hours) {
  const arrival = new Date(Date.now() + hours * 3600 * 1000);
  return arrival;
}

/**
 * 시간 포맷: "3일 4시간", "12시간 30분", "45분"
 */
export function formatHours(hours) {
  if (hours == null || isNaN(hours)) return "--";
  const totalMins = Math.round(hours * 60);
  const days = Math.floor(totalMins / (60 * 24));
  const hrs = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;

  if (days > 0) return `${days}일 ${hrs}시간`;
  if (hrs > 0) return `${hrs}시간 ${mins}분`;
  return `${mins}분`;
}
