import { Router } from "express";
import { logger } from "../utils/logger.js";

/** 관리자 여부 확인 미들웨어 */
function adminGuard(req, res, next) {
  if (req.accountRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/** 좌표 유효성 검사: [[lon, lat], ...] 형식, 각 포인트 범위 체크 */
function validateCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    return "coordinates는 2개 이상의 포인트 배열이어야 합니다";
  }
  if (coords.length > 500) {
    return "좌표는 최대 500개까지 허용됩니다";
  }
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) {
      return "각 포인트는 [lon, lat] 배열이어야 합니다";
    }
    const [lon, lat] = pt;
    if (typeof lon !== "number" || typeof lat !== "number") {
      return "좌표값은 숫자여야 합니다";
    }
    if (lat < -90 || lat > 90) return `위도 범위 초과: ${lat}`;
    if (lon < -180 || lon > 180) return `경도 범위 초과: ${lon}`;
  }
  return null;
}

export default function laneRoutes(prisma) {
  const router = Router();

  // ── GET /api/lanes — 전체 항로 목록 (인증 사용자 / active=all은 admin만) ───
  router.get("/", async (req, res) => {
    try {
      // admin만 비활성 항로 포함 조회 가능
      const showAll = req.query.active === "all" && req.accountRole === "admin";
      const where = showAll ? {} : { active: true };
      const lanes = await prisma.shippingLane.findMany({
        where,
        orderBy: { createdAt: "asc" },
      });
      res.json(lanes);
    } catch (e) {
      logger.error("[lanes] list error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /api/lanes/:id — 단일 항로 (모든 인증 사용자) ────────────────────
  router.get("/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid lane ID" });
      const lane = await prisma.shippingLane.findUnique({ where: { id } });
      if (!lane) return res.status(404).json({ error: "Lane not found" });
      res.json(lane);
    } catch (e) {
      logger.error("[lanes] get error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── 이하 admin only ───────────────────────────────────────────────────────
  // 설계 의도: GET /, GET /:id 는 모든 인증 사용자 허용 (지도 표시용)
  //           POST, PUT, DELETE 는 adminGuard로 admin만 허용
  router.use(adminGuard);

  // ── POST /api/lanes — 항로 생성 ──────────────────────────────────────────
  router.post("/", async (req, res) => {
    try {
      const { name, description, coordinates, color } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: "항로명은 필수입니다" });
      }
      if (name.trim().length > 100) {
        return res.status(400).json({ error: "항로명은 100자 이하여야 합니다" });
      }
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return res.status(400).json({ error: "색상은 #RRGGBB 형식이어야 합니다" });
      }

      const coordErr = validateCoordinates(coordinates);
      if (coordErr) return res.status(400).json({ error: coordErr });

      const lane = await prisma.shippingLane.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          coordinates,
          color: color || "#f59e0b",
          createdBy: req.account,
        },
      });

      logger.info(`[lanes] 생성: "${lane.name}" (${lane.id}) by ${req.account}`);
      res.status(201).json(lane);
    } catch (e) {
      logger.error("[lanes] create error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── PUT /api/lanes/:id — 항로 전체 수정 ──────────────────────────────────
  router.put("/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid lane ID" });

      const existing = await prisma.shippingLane.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Lane not found" });

      const { name, description, coordinates, color, active } = req.body;

      if (name !== undefined) {
        if (!name || name.trim().length === 0) {
          return res.status(400).json({ error: "항로명은 필수입니다" });
        }
        if (name.trim().length > 100) {
          return res.status(400).json({ error: "항로명은 100자 이하여야 합니다" });
        }
      }
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return res.status(400).json({ error: "색상은 #RRGGBB 형식이어야 합니다" });
      }
      if (coordinates !== undefined) {
        const coordErr = validateCoordinates(coordinates);
        if (coordErr) return res.status(400).json({ error: coordErr });
      }
      if (active !== undefined && typeof active !== "boolean") {
        return res.status(400).json({ error: "active는 boolean이어야 합니다" });
      }

      const lane = await prisma.shippingLane.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(description !== undefined && { description: description?.trim() || null }),
          ...(coordinates !== undefined && { coordinates }),
          ...(color !== undefined && { color }),
          ...(active !== undefined && { active }),
          updatedAt: new Date(),
        },
      });

      logger.info(`[lanes] 수정: "${lane.name}" (${lane.id}) by ${req.account}`);
      res.json(lane);
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Lane not found" });
      logger.error("[lanes] update error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── DELETE /api/lanes/:id — 항로 삭제 ────────────────────────────────────
  router.delete("/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid lane ID" });

      const existing = await prisma.shippingLane.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Lane not found" });

      await prisma.shippingLane.delete({ where: { id } });
      logger.info(`[lanes] 삭제: "${existing.name}" (${id}) by ${req.account}`);
      res.json({ success: true });
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Lane not found" });
      logger.error("[lanes] delete error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
