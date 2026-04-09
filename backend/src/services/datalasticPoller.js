import https from "https";
import cron from "node-cron";
import { geofenceChecker } from "./geofenceChecker.js";
import { logger } from "../utils/logger.js";

const API_BASE = "https://api.datalastic.com/api/v0";

// ── AIS 스푸핑 탐지 설정 ──
const MAX_SPEED_KNOTS = 25;

/**
 * Haversine 공식으로 두 좌표 간 거리 계산 (km)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * AIS 스푸핑 의심 여부 판단
 */
export function checkSpoofing(prevPos, newLat, newLon, newTime) {
  if (!prevPos) return { suspicious: false, impliedSpeed: null, reason: null };

  const distKm = haversineKm(prevPos.lat, prevPos.lon, newLat, newLon);
  const distNm = distKm * 0.539957;
  const elapsedHours = (new Date(newTime) - new Date(prevPos.timestamp)) / 3_600_000;

  if (elapsedHours <= 0) return { suspicious: false, impliedSpeed: null, reason: null };

  const impliedSpeed = distNm / elapsedHours;

  if (impliedSpeed > MAX_SPEED_KNOTS) {
    return {
      suspicious: true,
      impliedSpeed: Math.round(impliedSpeed * 10) / 10,
      reason: `전후 ${elapsedHours.toFixed(1)}시간 동안 ${distNm.toFixed(1)}nm 이동 (${impliedSpeed.toFixed(0)}kts > 허용차 ${MAX_SPEED_KNOTS}kts)`,
    };
  }

  return { suspicious: false, impliedSpeed: Math.round(impliedSpeed * 10) / 10, reason: null };
}

// API 호출 헬퍼 (1 크레딧 소모)
export function apiCall(endpoint, params) {
  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) return Promise.resolve(null);
  const qs = new URLSearchParams({ "api-key": apiKey, ...params }).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on("error", (err) => {
      logger.error(`[Datalastic] API 호출 오류 (${endpoint}):`, err.message);
      resolve(null);
    });
  });
}

/**
 * 공통: 단일 선박에 대해 API 응답 데이터를 파싱하고 DB에 저장 + 브로드캐스트
 * 여러 계정에서 같은 MMSI를 등록한 경우, vessel 목록을 배열로 받아 모두 저장한다.
 * @param {object} prisma
 * @param {Array}  vessels   - 같은 MMSI를 가진 선박 배열 (1개 이상)
 * @param {object} d         - Datalastic API 응답 data 객체
 * @param {Function|null} logFn  - 로거 함수 (null이면 logger.info)
 * @param {Function} onPosition
 * @param {Function} onZoneEvent
 */
async function processVesselData(prisma, vessels, d, logFn, onPosition, onZoneEvent) {
  const log = logFn || ((msg) => logger.info(msg));

  const lat = parseFloat(d.lat);
  const lon = parseFloat(d.lon);
  if (isNaN(lat) || isNaN(lon)) return;   // P0 버그 수정: !lat && !lon → isNaN 처리

  const cog       = parseFloat(d.course) || null;
  const sog       = parseFloat(d.speed)  || null;
  const heading   = d.heading != null && d.heading !== 511 ? parseInt(d.heading) : null;
  const navStatus = d.navigation_status || null;
  const destination = d.destination || null;
  const eta       = d.eta_UTC ? new Date(d.eta_UTC) : null;
  const timestamp = d.last_position_epoch ? new Date(d.last_position_epoch * 1000) : new Date();

  for (const v of vessels) {
    // 이름 업데이트 (미입력 시)
    if (d.name && !v.name) {
      await prisma.vessel.update({ where: { id: v.id }, data: { name: d.name } });
    }

    // AIS 스푸핑 탐지
    const prevPos = await prisma.position.findFirst({
      where: { vesselId: v.id, suspicious: false },
      orderBy: { timestamp: "desc" },
      select: { lat: true, lon: true, timestamp: true },
    });
    const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);

    if (suspicious) {
      logger.warn(`[Spoofing] ${v.mmsi} (${v.name || v.alias}) 스푸핑 의심: ${reason}`);
    }

    // upsert: 동일 (vesselId, timestamp)이면 스킵
    const position = await prisma.position.upsert({
      where: { vesselId_timestamp: { vesselId: v.id, timestamp } },
      create: {
        vesselId: v.id, lat, lon, cog, sog, heading,
        navStatus, destination, eta, timestamp,
        suspicious, impliedSpeed, spoofReason: reason,
      },
      update: {},
    });

    if (!suspicious) {
      // Geofence 검사
      const zoneEvents = await geofenceChecker.detectAndSave(prisma, v, position).catch(() => []);
      if (zoneEvents.length > 0 && onZoneEvent) {
        for (const ev of zoneEvents) {
          onZoneEvent({ ...ev, vesselName: d.name || v.alias || v.name || v.mmsi, account: v.account });
        }
      }
      const currentZones = geofenceChecker.getCurrentZones(v.id);

      log(`[Datalastic] ✅ ${v.mmsi} (${d.name || v.alias || v.account}) | ${lat.toFixed(4)},${lon.toFixed(4)} | SOG:${sog} | Dest:${destination}`);
      onPosition({
        vesselId: v.id,
        mmsi: v.mmsi,
        name: d.name || v.name || v.alias,
        ...position,
        currentZones,
      });
    }
  }
}

export function createDatalasticPoller(prisma, onPosition, onVesselUpdate, onZoneEvent) {
  let tasks = [];
  let currentCron = null;

  // ── 선박 제원 수집 (vessel_info, 최초 1회) ──
  async function fetchVesselInfo() {
    // infoFetched=false인 선박 중 MMSI dedup (같은 MMSI가 여러 계정에 있어도 1회만)
    const vessels = await prisma.vessel.findMany({ where: { infoFetched: false } });
    if (vessels.length === 0) return;

    const seen = new Set();
    const unique = vessels.filter((v) => {
      if (seen.has(v.mmsi)) return false;
      seen.add(v.mmsi);
      return true;
    });

    logger.info(`[Datalastic] Fetching vessel_info for ${unique.length} vessel(s)...`);

    for (const v of unique) {
      const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
      const res = await apiCall("vessel_info", params);
      try { await prisma.apiUsage.create({ data: { endpoint: "vessel_info", credits: 1, account: null } }); } catch {}
      if (!res?.data) continue;
      const d = res.data;

      // 같은 MMSI를 가진 모든 선박에 제원 업데이트
      const sameMMSI = vessels.filter((x) => x.mmsi === v.mmsi);
      for (const sv of sameMMSI) {
        await prisma.vessel.update({
          where: { id: sv.id },
          data: {
            imo: d.imo || null, callsign: d.callsign || null,
            countryIso: d.country_iso || null, countryName: d.country_name || null,
            vesselType: d.type || null, typeSpecific: d.type_specific || null,
            grossTonnage: d.gross_tonnage ? parseInt(d.gross_tonnage) : null,
            deadweight: d.deadweight ? parseInt(d.deadweight) : null,
            length: d.length ? parseFloat(d.length) : null,
            breadth: d.breadth ? parseFloat(d.breadth) : null,
            yearBuilt: d.year_built || null, homePort: d.home_port || null,
            speedAvg: d.speed_avg ? parseFloat(d.speed_avg) : null,
            speedMax: d.speed_max ? parseFloat(d.speed_max) : null,
            name: d.name || sv.name, infoFetched: true,
          },
        });
        const updated = await prisma.vessel.findUnique({ where: { id: sv.id } });
        if (updated && onVesselUpdate) onVesselUpdate(updated);
      }
      logger.info(`[Datalastic] ✅ vessel_info saved for ${v.mmsi} (${d.name}) - GT:${d.gross_tonnage} DWT:${d.deadweight} Built:${d.year_built}`);
    }
  }

  // ── 위치 폴링 (스케줄) ──
  async function pollPositions() {
    const allVessels = await prisma.vessel.findMany({ where: { active: true } });
    if (allVessels.length === 0) return;

    // MMSI별 그룹핑 — 같은 MMSI가 여러 계정에 등록된 경우 API 호출 1회
    const mmsiGroups = new Map();
    for (const v of allVessels) {
      if (!mmsiGroups.has(v.mmsi)) mmsiGroups.set(v.mmsi, []);
      mmsiGroups.get(v.mmsi).push(v);
    }

    logger.info(`[Datalastic] 📡 Polling ${mmsiGroups.size} unique MMSI(s) / ${allVessels.length} vessel(s) at ${new Date().toISOString()}`);

    for (const [mmsi, vesselGroup] of mmsiGroups) {
      const primary = vesselGroup[0];
      const params = primary.imo ? { imo: primary.imo } : { mmsi: primary.mmsi };
      const res = await apiCall("vessel", params);
      try { await prisma.apiUsage.create({ data: { endpoint: "vessel", credits: 1, account: null } }); } catch {}
      if (!res?.data) {
        logger.warn(`[Datalastic] ⚠ No data for ${primary.imo ? "IMO " + primary.imo : "MMSI " + mmsi}`);
        continue;
      }
      await processVesselData(prisma, vesselGroup, res.data, null, onPosition, onZoneEvent);
    }
  }

  // cron 스케줄 시작 헬퍼
  function startCron(cronExpr) {
    tasks.forEach((t) => t.stop());
    tasks = [];
    if (!cronExpr || !cron.validate(cronExpr)) {
      logger.error(`[Datalastic] 유효하지 않은 cron 표현식: ${cronExpr}`);
      return;
    }
    const task = cron.schedule(cronExpr, () => {
      pollPositions().catch((err) => logger.error("[Datalastic] pollPositions 오류:", err));
    });
    tasks.push(task);
    currentCron = cronExpr;
    logger.info(`[Datalastic] 🕐 Scheduler started (cron: ${cronExpr})`);
  }

  return {
    async forceUpdate(logFn, mmsiList = null) {
      const log = logFn || ((msg) => logger.info(msg));
      log("▶ 시작: 수동 강제 업데이트 작업을 시작합니다...");

      await fetchVesselInfo();
      let vessels = await prisma.vessel.findMany({ where: { active: true } });
      if (vessels.length === 0) { log("⚠ 등록된 선박이 없습니다."); return; }

      // MMSI 그룹핑
      const mmsiGroups = new Map();
      for (const v of vessels) {
        if (!mmsiGroups.has(v.mmsi)) mmsiGroups.set(v.mmsi, []);
        mmsiGroups.get(v.mmsi).push(v);
      }

      // mmsiList 필터 적용 (있으면)
      let targetGroups = [...mmsiGroups.entries()];
      if (mmsiList && mmsiList.length > 0) {
        const mmsiSet = new Set(mmsiList.map(String));
        targetGroups = targetGroups.filter(([mmsi]) => mmsiSet.has(mmsi));
        log(`⏩ 필터 적용: ${targetGroups.length}개 MMSI 대상`);
      }

      log(`[Datalastic] 📡 수동 폴링 시작 - ${targetGroups.length}개 MMSI`);

      let updatedCount = 0, skippedCount = 0;

      for (const [mmsi, vesselGroup] of targetGroups) {
        const primary = vesselGroup[0];
        const params = primary.imo ? { imo: primary.imo } : { mmsi: primary.mmsi };
        const res = await apiCall("vessel", params);

        if (!res?.data) {
          log(`[Datalastic] ⚠ 데이터 없음: ${primary.imo ? "IMO " + primary.imo : "MMSI " + mmsi} (${primary.name || primary.alias || ""})`);
          skippedCount++;
          continue;
        }

        const d = res.data;
        const lat = parseFloat(d.lat);
        const lon = parseFloat(d.lon);
        if (isNaN(lat) || isNaN(lon)) { skippedCount++; continue; }  // P0 버그 수정

        await processVesselData(prisma, vesselGroup, d, log, onPosition, onZoneEvent);
        log(`[Datalastic] ✅ 갱신: ${d.name || primary.alias || mmsi} | SOG:${d.speed} | 위치:${lat.toFixed(3)},${lon.toFixed(3)}`);
        updatedCount++;
      }

      log(`▶ 종료: 강제 업데이트 완료 (갱신 ${updatedCount}건, 스킵/오류 ${skippedCount}건)`);
    },

    async start() {
      // 서버 시작 시 즉시 1회 실행
      fetchVesselInfo()
        .then(() => pollPositions())
        .catch((err) => logger.error("[Datalastic] 초기 폴링 오류:", err));

      // DB에서 cron 설정 로드 (없으면 기본값)
      let cronExpr = "0 4,6,8,11,15,23 * * *";
      try {
        const cfg = await prisma.systemConfig.findUnique({ where: { key: "poll_cron" } });
        if (cfg?.value) cronExpr = cfg.value;
      } catch {}

      startCron(cronExpr);
      logger.info("[Datalastic] 🕐 KST 기준 00:00, 08:00, 13:00, 15:00, 17:00, 20:00 폴링 예정");
    },

    /** 폴링 스케줄 동적 변경 */
    reload(newCronExpr) {
      logger.info(`[Datalastic] cron 변경: ${currentCron} → ${newCronExpr}`);
      startCron(newCronExpr);
    },

    stop() {
      tasks.forEach((t) => t.stop());
      tasks = [];
      logger.info("[Datalastic] Scheduler stopped");
    },

    getCron() {
      return currentCron;
    },
  };
}
