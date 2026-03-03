import https from "https";

const VF_API_BASE = "https://api.vesselfinder.com/vessels";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분마다 폴링

/**
 * VesselFinder REST API를 주기적으로 폴링하여 위치 데이터를 가져옴
 * AISStream.io WebSocket과 함께 하이브리드 방식으로 동작
 */
export function createVesselFinderPoller(prisma, onPosition) {
  let timer = null;
  let isRunning = false;
  const apiKey = process.env.VESSELFINDER_API_KEY;

  async function fetchVesselData(mmsiList) {
    if (!apiKey) {
      console.log("[VF] API Key not configured, skipping poll");
      return;
    }
    if (mmsiList.length === 0) return;

    const mmsiParam = mmsiList.join(",");
    const url = `${VF_API_BASE}?userkey=${apiKey}&mmsi=${mmsiParam}`;

    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error("VF API parse error: " + data.substring(0, 200)));
          }
        });
      }).on("error", reject);
    });
  }

  async function poll() {
    try {
      const vessels = await prisma.vessel.findMany();
      if (vessels.length === 0) return;

      const mmsiList = vessels.map((v) => v.mmsi);
      console.log(`[VF] Polling ${mmsiList.length} vessel(s)...`);

      const data = await fetchVesselData(mmsiList);

      if (!Array.isArray(data)) {
        console.log("[VF] Unexpected response:", JSON.stringify(data).substring(0, 200));
        return;
      }

      console.log(`[VF] Received ${data.length} vessel position(s)`);

      for (const item of data) {
        try {
          // VesselFinder 응답 구조: AIS.MMSI, AIS.LATITUDE, AIS.LONGITUDE, 등
          const ais = item.AIS || {};
          const mmsi = String(ais.MMSI || "").padStart(9, "0");
          const lat = parseFloat(ais.LATITUDE);
          const lon = parseFloat(ais.LONGITUDE);
          const cog = parseFloat(ais.COG) || null;
          const sog = parseFloat(ais.SPEED) || null;
          const heading = ais.HEADING !== 511 ? ais.HEADING : null;
          const name = ais.NAME?.trim() || null;

          if (!mmsi || !lat || !lon || (lat === 0 && lon === 0)) continue;

          const vessel = await prisma.vessel.findUnique({ where: { mmsi } });
          if (!vessel) continue;

          // 이름 업데이트
          if (name && !vessel.name) {
            await prisma.vessel.update({
              where: { id: vessel.id },
              data: { name },
            });
          }

          // 최근 5분 내에 이미 저장된 위치가 있으면 중복 저장 방지
          const recentPos = await prisma.position.findFirst({
            where: {
              vesselId: vessel.id,
              timestamp: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
            orderBy: { timestamp: "desc" },
          });

          if (recentPos) {
            console.log(`[VF] ${mmsi} - recent position exists, skipping`);
            continue;
          }

          const position = await prisma.position.create({
            data: {
              vesselId: vessel.id,
              lat,
              lon,
              cog,
              sog,
              heading,
              timestamp: new Date(),
            },
          });

          console.log(`[VF] ✅ Saved position for ${mmsi} (${name || vessel.alias}) at ${lat.toFixed(4)},${lon.toFixed(4)} sog=${sog}`);

          onPosition({
            vesselId: vessel.id,
            mmsi,
            name: name || vessel.name || vessel.alias,
            ...position,
          });
        } catch (e) {
          console.error("[VF] Error processing vessel data:", e.message);
        }
      }
    } catch (e) {
      console.error("[VF] Poll error:", e.message);
    }
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      console.log(`[VF] Poller started (interval: ${POLL_INTERVAL_MS / 1000}s)`);
      // 시작 즉시 한 번 실행
      poll();
      timer = setInterval(poll, POLL_INTERVAL_MS);
    },

    stop() {
      isRunning = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      console.log("[VF] Poller stopped");
    },

    // 즉시 한 번 폴링 (선박 추가 시 호출)
    pollNow() {
      return poll();
    },
  };
}
