/**
 * Geofence Checker — JWLA 033 HRA 구역 진입/이탈 감지
 *
 * - 외부 의존성 없음 (Ray Casting 알고리즘으로 Point-in-Polygon 구현)
 * - 서버 시작 시 GeoJSON 파일을 메모리에 로드
 * - 검사 대상: war-risk-zone.geojson, 12nm_bounds.geojson, war-risk-zone-global.geojson
 *   (country zones 제외 — 선박은 해상에만 존재, 해역 구역과 중복)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_PUBLIC = join(__dirname, "../../../frontend/public");

// ─── Ray Casting: 점이 링(exterior ring)의 내부인지 판별 ───────────────────────
function rayInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Polygon 내부 여부 (holes 포함) ─────────────────────────────────────────
function pointInPolygonCoords(lon, lat, rings) {
  if (!rayInRing(lon, lat, rings[0])) return false; // 외부 링 밖이면 즉시 false
  for (let h = 1; h < rings.length; h++) {
    if (rayInRing(lon, lat, rings[h])) return false; // hole 안에 있으면 false
  }
  return true;
}

// ─── Feature (Polygon / MultiPolygon) 내부 여부 ─────────────────────────────
function pointInFeature(lon, lat, geometry) {
  if (!geometry) return false;
  const { type, coordinates } = geometry;
  if (type === "Polygon") {
    return pointInPolygonCoords(lon, lat, coordinates);
  }
  if (type === "MultiPolygon") {
    return coordinates.some((poly) => pointInPolygonCoords(lon, lat, poly));
  }
  return false;
}

// ─── Bounding Box 계산 (pre-filter용) ───────────────────────────────────────
function computeBbox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function visit(c) {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    } else { c.forEach(visit); }
  }
  visit(geometry.coordinates);
  return (minX === Infinity) ? null : [minX, minY, maxX, maxY];
}

// ─── GeofenceChecker ────────────────────────────────────────────────────────
export class GeofenceChecker {
  constructor() {
    this.zones = [];   // { name, geometry, bbox }
    this.loaded = false;
    // in-memory: vesselId → Set<zoneName> (현재 체류 중인 구역들)
    this.vesselZoneState = new Map();
  }

  /** GeoJSON 파일 로드 (서버 시작 시 1회) */
  loadZones() {
    const files = [
      "war-risk-zone.geojson",
      "12nm_bounds.geojson",
      "war-risk-zone-global.geojson",
    ];

    this.zones = [];
    let totalLoaded = 0;

    for (const filename of files) {
      const filepath = join(FRONTEND_PUBLIC, filename);
      if (!existsSync(filepath)) {
        console.warn(`[Geofence] ⚠ Zone file not found: ${filename}`);
        continue;
      }
      try {
        const data = JSON.parse(readFileSync(filepath, "utf-8"));
        const features = Array.isArray(data.features) ? data.features : [];
        for (const f of features) {
          const name = f.properties?.name;
          if (!name || !f.geometry) continue;
          const bbox = computeBbox(f.geometry);
          this.zones.push({ name, geometry: f.geometry, bbox });
          totalLoaded++;
        }
        console.log(`[Geofence] ✅ ${features.length} zones from ${filename}`);
      } catch (e) {
        console.error(`[Geofence] ❌ Failed to load ${filename}:`, e.message);
      }
    }

    console.log(`[Geofence] 📍 Total: ${totalLoaded} zones loaded`);
    this.loaded = true;
  }

  /** 특정 좌표가 속하는 zone 이름 목록 반환 */
  checkPoint(lon, lat) {
    if (!this.loaded) this.loadZones();
    const result = [];
    for (const zone of this.zones) {
      // bbox 사전 필터 (빠른 제외)
      if (zone.bbox) {
        const [x0, y0, x1, y1] = zone.bbox;
        if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      }
      if (pointInFeature(lon, lat, zone.geometry)) {
        result.push(zone.name);
      }
    }
    return result;
  }

  /**
   * 서버 시작 시 각 선박의 최신 위치로 현재 zone 상태 초기화
   * - 재시작 후 첫 폴링에서 허위 entry 이벤트 방지
   * - 이미 HRA 안에 있지만 DB에 entry 기록이 없는 선박은 entry 이벤트 복원
   *   (last zoneEvent가 없거나 exit인 경우만 생성 → 중복 방지)
   */
  async initState(prisma, onZoneEvent = null) {
    let vesselCount = 0;
    let restoredCount = 0;
    try {
      const vessels = await prisma.vessel.findMany({
        where: { active: true },
        select: { id: true, name: true, alias: true, mmsi: true, account: true },
      });
      vesselCount = vessels.length;

      for (const v of vessels) {
        const lastPos = await prisma.position.findFirst({
          where: { vesselId: v.id, suspicious: false },
          orderBy: { timestamp: "desc" },
          select: { lat: true, lon: true, timestamp: true },
        });

        if (!lastPos) {
          this.vesselZoneState.set(v.id, new Set());
          continue;
        }

        const zones = new Set(this.checkPoint(lastPos.lon, lastPos.lat));
        this.vesselZoneState.set(v.id, zones);

        // HRA 안에 있는 선박 중 DB에 entry 기록이 없거나 마지막이 exit인 경우 복원
        for (const zoneName of zones) {
          const lastEvent = await prisma.zoneEvent.findFirst({
            where: { vesselId: v.id, zoneName },
            orderBy: { createdAt: "desc" },
            select: { eventType: true },
          });

          if (!lastEvent || lastEvent.eventType === "exit") {
            const restoredEvent = await prisma.zoneEvent.create({
              data: {
                vesselId: v.id,
                zoneName,
                eventType: "entry",
                lat: lastPos.lat,
                lon: lastPos.lon,
                posTimestamp: lastPos.timestamp,
              },
            });
            restoredCount++;
            const displayName = v.alias || v.name || v.mmsi;
            console.log(`[Geofence] 📌 entry 복원: ${displayName} → ${zoneName}`);
            if (onZoneEvent) {
              try {
                await onZoneEvent({ ...restoredEvent, vesselName: displayName, account: v.account });
              } catch (callbackError) {
                console.error("[Geofence] replay callback error:", callbackError.message);
              }
            }
          }
        }
      }

      console.log(`[Geofence] 🗺 State initialized for ${vessels.length} vessels (entry 복원: ${restoredCount}건)`);
      return { vessels: vesselCount, restored: restoredCount };
    } catch (e) {
      console.error("[Geofence] initState error:", e.message);
      return { vessels: vesselCount, restored: restoredCount, error: true };
    }
  }

  /**
   * 새 위치 수신 후 zone 진입/이탈 감지 → DB 저장 + 이벤트 반환
   * @returns {Array} events — [{ vesselId, zoneName, eventType, lat, lon, posTimestamp }]
   */
  async detectAndSave(prisma, vessel, position) {
    const { id: vesselId, name, alias, mmsi } = vessel;
    const { lat, lon, timestamp: posTimestamp } = position;

    let currentZones;
    try {
      currentZones = new Set(this.checkPoint(lon, lat));
    } catch (e) {
      console.error("[Geofence] checkPoint error:", e.message);
      return [];
    }

    const previousZones = this.vesselZoneState.get(vesselId) || new Set();
    const displayName = alias || name || mmsi;
    const events = [];

    // 진입: currentZones에 있고 previousZones에 없는 것
    for (const zoneName of currentZones) {
      if (!previousZones.has(zoneName)) {
        events.push({ vesselId, zoneName, eventType: "entry", lat, lon, posTimestamp });
        console.log(`[Geofence] 🔴 ENTRY  ${displayName} → ${zoneName}`);
      }
    }

    // 이탈: previousZones에 있고 currentZones에 없는 것
    for (const zoneName of previousZones) {
      if (!currentZones.has(zoneName)) {
        events.push({ vesselId, zoneName, eventType: "exit", lat, lon, posTimestamp });
        console.log(`[Geofence] 🟢 EXIT   ${displayName} ← ${zoneName}`);
      }
    }

    // DB 저장 (실패해도 위치 저장 영향 없음)
    for (const ev of events) {
      try {
        await prisma.zoneEvent.create({ data: ev });
      } catch (e) {
        console.error("[Geofence] zoneEvent.create error:", e.message);
      }
    }

    // in-memory 상태 업데이트
    this.vesselZoneState.set(vesselId, currentZones);

    return events;
  }

  /** 선박의 현재 체류 구역 목록 반환 */
  getCurrentZones(vesselId) {
    return Array.from(this.vesselZoneState.get(vesselId) || []);
  }
}

// 싱글턴 export
export const geofenceChecker = new GeofenceChecker();
