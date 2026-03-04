import https from "https";
import cron from "node-cron";

const API_BASE = "https://api.datalastic.com/api/v0";

// API 호출 헬퍼 (1 크레딧 소모)
function apiCall(endpoint, params) {
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
      const res = await apiCall("vessel_info", { mmsi: v.mmsi });
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
    const vessels = await prisma.vessel.findMany();
    if (vessels.length === 0) return;
    const now = new Date();
    console.log(`[Datalastic] 📡 Polling ${vessels.length} vessel(s) at ${now.toISOString()}`);

    for (const v of vessels) {
      const res = await apiCall("vessel", { mmsi: v.mmsi });
      if (!res?.data) {
        console.log(`[Datalastic] ⚠ No data for MMSI ${v.mmsi}`);
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

      // 동일 타임스탬프 중복 방지
      const existing = await prisma.position.findFirst({
        where: { vesselId: v.id, timestamp },
      });
      if (existing) {
        console.log(`[Datalastic] ${v.mmsi} - timestamp ${timestamp.toISOString()} already exists, skipping`);
        continue;
      }

      const position = await prisma.position.create({
        data: {
          vesselId: v.id,
          lat, lon, cog, sog, heading,
          navStatus,
          destination,
          eta,
          timestamp,
        },
      });

      console.log(`[Datalastic] ✅ ${v.mmsi} (${d.name || v.alias}) | ${lat.toFixed(4)},${lon.toFixed(4)} | SOG:${sog} | Dest:${destination} | ETA:${d.eta_UTC || "-"}`);

      onPosition({
        vesselId: v.id,
        mmsi: v.mmsi,
        name: d.name || v.name || v.alias,
        ...position,
      });
    }
  }

  return {
    start() {
      // 서버 시작 시 즉시 1회 실행
      fetchVesselInfo().then(() => pollPositions());

      // KST 기준 00, 08, 13, 15, 17, 20시에 폴링 (UTC: 15, 23, 04, 06, 08, 11)
      // node-cron은 서버 시스템 시간을 따르므로, 서버가 UTC라면 UTC로 변환
      // KST = UTC + 9
      // 00:00 KST = 15:00 UTC (전일)
      // 08:00 KST = 23:00 UTC (전일)
      // 13:00 KST = 04:00 UTC
      // 15:00 KST = 06:00 UTC
      // 17:00 KST = 08:00 UTC
      // 20:00 KST = 11:00 UTC
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
