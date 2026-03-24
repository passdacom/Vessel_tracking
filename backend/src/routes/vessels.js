import { Router } from "express";
import { VESSEL_COLORS } from "../utils/colors.js";
import { apiCall, checkSpoofing } from "../services/datalasticPoller.js";

/** parseInt 실패(NaN, 음수) 시 null 반환 */
function parseId(idStr) {
  const id = parseInt(idStr, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** 입력값 유효성 검증 헬퍼 */
function validatePositionFields({ lat, lon, sog, cog, heading }) {
  const errors = [];
  const latF = parseFloat(lat);
  const lonF = parseFloat(lon);
  if (isNaN(latF) || latF < -90 || latF > 90) errors.push("위도(lat)는 -90~90 범위여야 합니다");
  if (isNaN(lonF) || lonF < -180 || lonF > 180) errors.push("경도(lon)는 -180~180 범위여야 합니다");
  if (sog != null && (isNaN(parseFloat(sog)) || parseFloat(sog) < 0 || parseFloat(sog) > 100))
    errors.push("속도(sog)는 0~100 knots 범위여야 합니다");
  if (cog != null && (isNaN(parseFloat(cog)) || parseFloat(cog) < 0 || parseFloat(cog) > 360))
    errors.push("침로(cog)는 0~360 범위여야 합니다");
  if (heading != null && (isNaN(parseFloat(heading)) || parseFloat(heading) < 0 || parseFloat(heading) > 360))
    errors.push("선수방향(heading)은 0~360 범위여야 합니다");
  return errors;
}

export default function vesselRoutes(prisma) {
  const router = Router();

  // List all vessels
  router.get("/", async (req, res) => {
    try {
      const vessels = await prisma.vessel.findMany({
        include: { positions: { orderBy: { timestamp: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      });
      res.json(vessels);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Get position history
  router.get("/:id/positions", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid vessel ID" });

      const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 720); // 1h ~ 30일 제한
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      // suspicious=true인 스푸핑 의심 위치는 항적 트랙에서 제외
      let positions = await prisma.position.findMany({
        where: { vesselId: id, timestamp: { gte: since }, suspicious: false },
        orderBy: { timestamp: "desc" },
        take: 2000,
      });

      // 조회 기간 내 정상 데이터가 없으면 가장 최근 정상 위치 1건 fallback
      if (positions.length === 0) {
        const latest = await prisma.position.findFirst({
          where: { vesselId: id, suspicious: false },
          orderBy: { timestamp: "desc" },
        });
        if (latest) {
          positions = [latest];
        }
      }

      res.json(positions);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Manual position entry
  router.post("/:id/positions", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid vessel ID" });

      const { lat, lon, cog, sog, heading, timestamp } = req.body;

      if (lat == null || lon == null) {
        return res.status(400).json({ error: "위도(lat)와 경도(lon)는 필수입니다" });
      }

      const validationErrors = validatePositionFields({ lat, lon, cog, sog, heading });
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: validationErrors.join(", ") });
      }

      // timestamp 유효성 검증
      let ts = new Date();
      if (timestamp) {
        ts = new Date(timestamp);
        if (isNaN(ts.getTime())) return res.status(400).json({ error: "유효하지 않은 timestamp 형식입니다" });
      }

      const vessel = await prisma.vessel.findUnique({ where: { id } });
      if (!vessel) return res.status(404).json({ error: "Vessel not found" });

      const position = await prisma.position.create({
        data: {
          vesselId: id,
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          cog: cog != null ? parseFloat(cog) : null,
          sog: sog != null ? parseFloat(sog) : null,
          heading: heading != null ? parseInt(heading) : null,
          timestamp: ts,
        },
      });

      console.log(`[Manual] Position added for vessel ${id}`);

      req.app.locals.wsServer?.broadcast({
        type: "position",
        data: {
          vesselId: vessel.id,
          mmsi: vessel.mmsi,
          name: vessel.name || vessel.alias,
          ...position,
        },
      });

      res.status(201).json(position);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Add vessel
  router.post("/", async (req, res) => {
    try {
      const { mmsi, alias, color, companyType } = req.body;
      if (!mmsi || !/^\d{9}$/.test(mmsi)) {
        return res.status(400).json({ error: "Valid 9-digit MMSI required" });
      }
      if (alias && alias.length > 100) return res.status(400).json({ error: "Alias는 100자 이하여야 합니다" });
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: "색상은 #RRGGBB 형식이어야 합니다" });
      if (companyType && companyType.length > 100) return res.status(400).json({ error: "그룹명은 100자 이하여야 합니다" });

      const existingCount = await prisma.vessel.count();
      const assignedColor = color || VESSEL_COLORS[existingCount % VESSEL_COLORS.length];
      const vessel = await prisma.vessel.create({
        data: { mmsi, alias: alias || null, color: assignedColor, companyType: companyType || '자사간사' },
      });

      req.app.locals.wsServer?.broadcast({ type: "vessel_added", data: vessel });
      res.status(201).json(vessel);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "Vessel already registered" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update vessel
  router.patch("/:id", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid vessel ID" });

      const { alias, color, companyType, active } = req.body;
      if (alias && alias.length > 100) return res.status(400).json({ error: "Alias는 100자 이하여야 합니다" });
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: "색상은 #RRGGBB 형식이어야 합니다" });
      if (companyType && companyType.length > 100) return res.status(400).json({ error: "그룹명은 100자 이하여야 합니다" });
      if (active !== undefined && typeof active !== "boolean") return res.status(400).json({ error: "active는 boolean이어야 합니다" });

      const vessel = await prisma.vessel.update({
        where: { id },
        data: {
          ...(alias !== undefined && { alias: alias || null }),
          ...(color !== undefined && { color }),
          ...(companyType !== undefined && { companyType }),
          ...(active !== undefined && { active }),
        },
      });
      req.app.locals.wsServer?.broadcast({ type: "vessel_updated", data: vessel });
      res.json(vessel);
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Vessel not found" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fetch historical positions from Datalastic API
  router.post("/:id/history", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid vessel ID" });

      const days = Math.min(Math.max(parseInt(req.body.days) || 7, 1), 30);

      const vessel = await prisma.vessel.findUnique({ where: { id } });
      if (!vessel) return res.status(404).json({ error: "Vessel not found" });

      if (!vessel.imo && !vessel.mmsi) {
        return res.status(400).json({ error: "선박의 IMO 또는 MMSI가 필요합니다" });
      }

      const params = vessel.imo ? { imo: vessel.imo, days } : { mmsi: vessel.mmsi, days };
      const result = await apiCall("vessel_hist", params);

      if (!result || (!result.data && !Array.isArray(result))) {
        return res.status(502).json({ error: "Datalastic API 응답 없음", credits_used: days });
      }

      // Datalastic vessel_hist 응답: data 배열 또는 최상위 배열
      const records = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);

      if (records.length === 0) {
        return res.json({ fetched: 0, stored: 0, credits_used: days });
      }

      let stored = 0;
      // 시간순 정렬 (오래된 것부터 — 스푸핑 체크 위해)
      const sorted = records
        .filter(r => {
          const lat = parseFloat(r.lat);
          const lon = parseFloat(r.lon);
          return !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0);
        })
        .sort((a, b) => {
          const tA = a.last_position_epoch || a.timestamp_epoch || 0;
          const tB = b.last_position_epoch || b.timestamp_epoch || 0;
          return tA - tB;
        });

      for (const r of sorted) {
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.lon);
        const cog = parseFloat(r.course) || null;
        const sog = parseFloat(r.speed) || null;
        const heading = r.heading != null && r.heading !== 511 ? parseInt(r.heading) : null;
        const navStatus = r.navigation_status || null;
        const destination = r.destination || null;
        const eta = r.eta_UTC ? new Date(r.eta_UTC) : null;
        const epoch = r.last_position_epoch || r.timestamp_epoch;
        const timestamp = epoch ? new Date(epoch * 1000) : null;

        if (!timestamp || isNaN(timestamp.getTime())) continue;

        // 스푸핑 체크: 직전 정상 위치 조회
        const prevPos = await prisma.position.findFirst({
          where: { vesselId: id, suspicious: false, timestamp: { lt: timestamp } },
          orderBy: { timestamp: "desc" },
          select: { lat: true, lon: true, timestamp: true },
        });
        const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);

        try {
          await prisma.position.upsert({
            where: { vesselId_timestamp: { vesselId: id, timestamp } },
            create: {
              vesselId: id,
              lat, lon, cog, sog, heading,
              navStatus, destination, eta, timestamp,
              suspicious, impliedSpeed, spoofReason: reason,
            },
            update: {},
          });
          stored++;
        } catch {
          // 중복 등 개별 레코드 실패 시 스킵
        }
      }

      console.log(`[History] Fetched ${records.length} records for vessel ${id} (${vessel.name || vessel.mmsi}), stored ${stored}, cost ${days} credits`);
      res.json({ fetched: records.length, stored, credits_used: days });
    } catch (e) {
      console.error("[History] Error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete vessel
  router.delete("/:id", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid vessel ID" });

      // Position 레코드 먼저 삭제 (FK 제약 위반 방지)
      await prisma.position.deleteMany({ where: { vesselId: id } });
      await prisma.vessel.delete({ where: { id } });

      req.app.locals.wsServer?.broadcast({ type: "vessel_removed", data: { id } });
      res.json({ success: true });
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Vessel not found" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
