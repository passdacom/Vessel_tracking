import https from "https";
import cron from "node-cron";

const API_BASE = "https://api.datalastic.com/api/v0";

// ── AIS 스푸핑 탐지 설정 ──
const MAX_SPEED_KNOTS = 25; // 최대 허용 속도 (knots) - 화물선/탱커 기준

/**
 * Haversine 공식으로 두 좌표 간 거리 계산 (km)
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 지구 반지름 km
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
 * @param {{lat, lon, timestamp}} prevPos - 직전 위치
 * @param {number} newLat - 새 위도
 * @param {number} newLon - 새 경도
 * @param {Date}   newTime - 새 타임스탬프
 * @returns {{ suspicious: boolean, impliedSpeed: number|null, reason: string|null }}
 */
export function checkSpoofing(prevPos, newLat, newLon, newTime) {
  if (!prevPos) return { suspicious: false, impliedSpeed: null, reason: null };

  const distKm = haversineKm(prevPos.lat, prevPos.lon, newLat, newLon);
  const distNm = distKm * 0.539957; // km → 해리
  const elapsedHours = (new Date(newTime) - new Date(prevPos.timestamp)) / 3_600_000;

  // 시간 차이가 0 이하면 무시
  if (elapsedHours <= 0) return { suspicious: false, impliedSpeed: null, reason: null };

  const impliedSpeed = distNm / elapsedHours; // knots

  if (impliedSpeed > MAX_SPEED_KNOTS) {
    return {
      suspicious: true,
      impliedSpeed: Math.round(impliedSpeed * 10) / 10,
      reason: `차전 ${elapsedHours.toFixed(1)}시간 동안 ${distNm.toFixed(1)}nm 이동 (${impliedSpeed.toFixed(0)}kts > 허용차 ${MAX_SPEED_KNOTS}kts)`,
    };
  }

  return { suspicious: false, impliedSpeed: Math.round(impliedSpeed * 10) / 10, reason: null };
}

// API 호출 헬퍼 (1 크레딧 소모) — 외부에서도 사용 가능하도록 export
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
    }).on("error", () => resolve(null));
  });
}

export function createDatalasticPoller(prisma, onPosition) {
  let tasks = [];

  // ── 선박 제원 수집 (vessel_info, 최초 1회) ──
  async function fetchVesselInfo() {
    const vessels = await prisma.vessel.findMany({ where: { infoFetched: false } });
    if (vessels.length === 0) return;
    console.log(`[Datalastic] Fetching vessel_info for ${vessels.length} vessel(s)...`);

    for (const v of vessels) {
      const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
      const res = await apiCall("vessel_info", params);
      try { await prisma.apiUsage.create({ data: { endpoint: "vessel_info", credits: 1, account: null } }); } catch {}
      if (!res?.data) continue;
      const d = res.data;
      await prisma.vessel.update({
        where: { id: v.id },
        data: {
          imo: d.imo || null,
          callsign: d.callsign || null,
          countryIso: d.country_iso || null,
          countryName: d.country_name || null,
          vesselType: d.type || null,
          typeSpecific: d.type_specific || null,
          grossTonnage: d.gross_tonnage ? parseInt(d.gross_tonnage) : null,
          deadweight: d.deadweight ? parseInt(d.deadweight) : null,
          length: d.length ? parseFloat(d.length) : null,
          breadth: d.breadth ? parseFloat(d.breadth) : null,
          yearBuilt: d.year_built || null,
          homePort: d.home_port || null,
          speedAvg: d.speed_avg ? parseFloat(d.speed_avg) : null,
          speedMax: d.speed_max ? parseFloat(d.speed_max) : null,
          name: d.name || v.name,
          infoFetched: true,
        },
      });
      console.log(`[Datalastic] ✅ vessel_info saved for ${v.mmsi} (${d.name}) - GT:${d.gross_tonnage} DWT:${d.deadweight} Built:${d.year_built}`);
    }
  }

  // ── 위치 + 항해 정보 수집 (vessel, 스케줄 폴링) ──
  async function pollPositions() {
    const vessels = await prisma.vessel.findMany({ where: { active: true } });
    if (vessels.length === 0) return;
    const now = new Date();
    console.log(`[Datalastic] 📡 Polling ${vessels.length} vessel(s) at ${now.toISOString()}`);

    for (const v of vessels) {
      const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
      const res = await apiCall("vessel", params);
      try { await prisma.apiUsage.create({ data: { endpoint: "vessel", credits: 1, account: null } }); } catch {}
      if (!res?.data) {
        console.log(`[Datalastic] ⚠ No data for ${v.imo ? 'IMO ' + v.imo : 'MMSI ' + v.mmsi}`);
        continue;
      }
      const d = res.data;
      const lat = parseFloat(d.lat);
      const lon = parseFloat(d.lon);
      if (!lat && !lon) continue;

      const cog = parseFloat(d.course) || null;
      const sog = parseFloat(d.speed) || null;
      const heading = d.heading != null && d.heading !== 511 ? parseInt(d.heading) : null;
      const navStatus = d.navigation_status || null;
      const destination = d.destination || null;
      const eta = d.eta_UTC ? new Date(d.eta_UTC) : null;
      const timestamp = d.last_position_epoch ? new Date(d.last_position_epoch * 1000) : new Date();

      // 이름 업데이트
      if (d.name && !v.name) {
        await prisma.vessel.update({ where: { id: v.id }, data: { name: d.name } });
      }

      // ----- AIS 스푸핑 탐지 -----
      const prevPos = await prisma.position.findFirst({
        where: { vesselId: v.id, suspicious: false },
        orderBy: { timestamp: 'desc' },
        select: { lat: true, lon: true, timestamp: true },
      });
      const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);

      if (suspicious) {
        console.warn(`[Spoofing] ⚠ ${v.mmsi} (${v.name || v.alias}) 스푸핑 의심: ${reason}`);
      }
      // -------------------------

      // upsert: 동일 (vesselId, timestamp) 이미 존재하면 스킵 (no-op update)
      const position = await prisma.position.upsert({
        where: { vesselId_timestamp: { vesselId: v.id, timestamp } },
        create: {
          vesselId: v.id,
          lat, lon, cog, sog, heading,
          navStatus,
          destination,
          eta,
          timestamp,
          suspicious,
          impliedSpeed,
          spoofReason: reason,
        },
        update: {}, // 이미 존재하면 변경 없이 스킵
      });

      if (!suspicious) {
        console.log(`[Datalastic] ✅ ${v.mmsi} (${d.name || v.alias}) | ${lat.toFixed(4)},${lon.toFixed(4)} | SOG:${sog} | Dest:${destination} | ETA:${d.eta_UTC || "-"}`);
        onPosition({
          vesselId: v.id,
          mmsi: v.mmsi,
          name: d.name || v.name || v.alias,
          ...position,
        });
      }
    }
  }

  return {
    async forceUpdate(logger, mmsiList = null) {
      if (logger) logger("▶ 시작: 수동 강제 업데이트 작업을 시작합니다...");
      let vessels = await prisma.vessel.findMany({ where: { active: true } });
      if (vessels.length === 0) {
        if (logger) logger("⚠ 등록된 선박이 없습니다.");
        return;
      }

      // mmsiList가 있으면 해당 선박만 필터링
      if (mmsiList && mmsiList.length > 0) {
        const mmsiSet = new Set(mmsiList.map(String));
        vessels = vessels.filter(v => mmsiSet.has(String(v.mmsi)));
        if (logger) logger(`⏩ 필터 적용: ${vessels.length}척 대상`);
      }

      const now = new Date();
      if (logger) logger(`[Datalastic] 📡 수동 폴링 시작 - ${vessels.length}척 | 대상시간: ${now.toISOString()}`);

      let updatedCount = 0;
      let skippedCount = 0;

      for (const v of vessels) {
        const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
        const res = await apiCall("vessel", params);

        if (!res?.data) {
          if (logger) logger(`[Datalastic] ⚠ 데이터 없음: ${v.imo ? 'IMO ' + v.imo : 'MMSI ' + v.mmsi} (${v.name || v.alias || ''})`);
          skippedCount++;
          continue;
        }

        const d = res.data;
        const lat = parseFloat(d.lat);
        const lon = parseFloat(d.lon);
        if (!lat && !lon) {
          skippedCount++;
          continue;
        }

        const cog = parseFloat(d.course) || null;
        const sog = parseFloat(d.speed) || null;
        const heading = d.heading != null && d.heading !== 511 ? parseInt(d.heading) : null;
        const navStatus = d.navigation_status || null;
        const destination = d.destination || null;
        const eta = d.eta_UTC ? new Date(d.eta_UTC) : null;
        const timestamp = d.last_position_epoch ? new Date(d.last_position_epoch * 1000) : new Date();

        // 이름 업데이트
        if (d.name && !v.name) {
          await prisma.vessel.update({ where: { id: v.id }, data: { name: d.name } });
        }

        // ----- AIS 스푸핑 탐지 -----
        const prevPosF = await prisma.position.findFirst({
          where: { vesselId: v.id, suspicious: false },
          orderBy: { timestamp: 'desc' },
          select: { lat: true, lon: true, timestamp: true },
        });
        const { suspicious: susp, impliedSpeed: ispd, reason: sreason } = checkSpoofing(prevPosF, lat, lon, timestamp);

        if (susp) {
          if (logger) logger(`[Spoofing] ⚠ ${v.name || v.mmsi} 스푸핑 의심: ${sreason}`);
        }
        // -------------------------

        // upsert: 동일 (vesselId, timestamp) 이미 존재하면 스킵 (no-op update)
        const position = await prisma.position.upsert({
          where: { vesselId_timestamp: { vesselId: v.id, timestamp } },
          create: {
            vesselId: v.id,
            lat, lon, cog, sog, heading,
            navStatus,
            destination,
            eta,
            timestamp,
            suspicious: susp,
            impliedSpeed: ispd,
            spoofReason: sreason,
          },
          update: {}, // 이미 존재하면 변경 없이 스킵
        });

        // createdAt === updatedAt이면 신규, 아니면 중복 스킵
        const isNew = position.id !== undefined;
        if (logger) logger(`[Datalastic] ${susp ? '🚨 [Spoofing]' : '✅'} 갱신: ${d.name || v.alias || v.mmsi} | SOG:${sog} | 위치:${lat.toFixed(3)},${lon.toFixed(3)} | 시간:${timestamp.toISOString()}`);
        updatedCount++;

        if (!susp) {
          onPosition({
            vesselId: v.id,
            mmsi: v.mmsi,
            name: d.name || v.name || v.alias,
            ...position,
          });
        }
      }

      if (logger) logger(`▶ 종료: 수동 강제 업데이트 완료 (갱신 ${updatedCount}건, 스킵/오류 ${skippedCount}건)`);
    },
    start() {
      // 서버 시작 시 즉시 1회 실행
      fetchVesselInfo().then(() => pollPositions());

      // KST 기준 00, 08, 13, 15, 17, 20시에 폴링 (UTC: 15, 23, 04, 06, 08, 11)
      const cronExpr = "0 4,6,8,11,15,23 * * *"; // UTC 시간 기준
      const task = cron.schedule(cronExpr, () => {
        pollPositions();
      });
      tasks.push(task);

      console.log("[Datalastic] 🕐 Scheduler started - KST 00:00, 08:00, 13:00, 15:00, 17:00, 20:00");
      console.log("[Datalastic] 🕐 (UTC cron: " + cronExpr + ")");
    },

    stop() {
      tasks.forEach((t) => t.stop());
      tasks = [];
      console.log("[Datalastic] Scheduler stopped");
    },
  };
}
