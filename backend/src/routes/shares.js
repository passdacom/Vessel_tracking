import express from "express";
import crypto from "crypto";

const DEFAULT_EXPIRY_HOURS = 7 * 24;
const MAX_EXPIRY_HOURS = 30 * 24;
const MAX_PUBLIC_HISTORY_HOURS = 7 * 24;

function parseShareVesselIds(rawIds) {
  try {
    const parsedIds = JSON.parse(rawIds);
    if (!Array.isArray(parsedIds)) return null;
    return [...new Set(parsedIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  // Auth is already handled by the global middleware (req.account is set)
  // This just ensures the request has been authenticated
  if (!req.account) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export default function sharesRoutes(prisma) {
  const router = express.Router();

  // 공유 링크 목록 조회
  // - admin: 전체 링크 조회
  // - user: 본인이 생성한 링크만 조회
  // - legacy(createdBy null): admin만 관리 가능, 공개 조회는 계속 허용
  router.get("/", requireAdmin, async (req, res) => {
    const where = req.accountRole === "admin" ? {} : { createdBy: req.account };
    const shares = await prisma.sharedView.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(shares.map((share) => {
      const vesselIds = parseShareVesselIds(share.vesselIds);
      return {
        ...share,
        vesselIds: vesselIds || [],
        ...(vesselIds ? {} : { invalidData: true }),
      };
    }));
  });

  // 공유 링크 생성 (인증 사용자)
  router.post("/", requireAdmin, async (req, res) => {
    const { label, vesselIds, expiresInHours = DEFAULT_EXPIRY_HOURS } = req.body;
    if (!label || !Array.isArray(vesselIds) || vesselIds.length === 0) {
      return res.status(400).json({ error: "label and vesselIds are required" });
    }
    const normalizedIds = vesselIds.map((id) => Number(id));
    if (normalizedIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return res.status(400).json({ error: "vesselIds must contain positive integer IDs" });
    }
    if (new Set(normalizedIds).size !== normalizedIds.length) {
      return res.status(400).json({ error: "duplicate vesselIds are not allowed" });
    }
    const expiryHours = Number(expiresInHours);
    if (!Number.isFinite(expiryHours) || expiryHours < 1 || expiryHours > MAX_EXPIRY_HOURS) {
      return res.status(400).json({ error: `expiresInHours must be between 1 and ${MAX_EXPIRY_HOURS}` });
    }

    const where = { id: { in: normalizedIds } };
    if (req.accountRole !== "admin") where.account = req.account;
    const allowedVessels = await prisma.vessel.findMany({ where, select: { id: true } });
    if (allowedVessels.length !== normalizedIds.length) {
      return res.status(req.accountRole === "admin" ? 400 : 403).json({
        error: req.accountRole === "admin"
          ? "One or more vessels do not exist"
          : "One or more vessels are not owned by this account",
      });
    }

    const token = crypto.randomBytes(12).toString("base64url");
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    const share = await prisma.sharedView.create({
      data: {
        token,
        label,
        vesselIds: JSON.stringify(normalizedIds),
        createdBy: req.account,
        expiresAt,
      },
    });
    res.json({ ...share, vesselIds: JSON.parse(share.vesselIds) });
  });

  // 공유 링크 삭제
  // - admin: 전체 삭제 가능
  // - user: 본인이 생성한 링크만 삭제 가능
  router.delete("/:token", requireAdmin, async (req, res) => {
    try {
      const where = req.accountRole === "admin"
        ? { token: req.params.token }
        : { token: req.params.token, createdBy: req.account };
      const result = await prisma.sharedView.deleteMany({ where });
      if (result.count === 0) return res.status(404).json({ error: "Share not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 공개: 토큰으로 선박 데이터 조회 (읽기 전용)
  router.get("/view/:token", async (req, res) => {
    const share = await prisma.sharedView.findUnique({ where: { token: req.params.token } });
    if (!share) return res.status(404).json({ error: "Invalid or expired link" });
    if (share.expiresAt && new Date() > share.expiresAt) {
      return res.status(410).json({ error: "This link has expired" });
    }

    const vesselIds = parseShareVesselIds(share.vesselIds);
    if (!vesselIds) {
      return res.status(404).json({ error: "Invalid or expired link" });
    }
    const requestedHours = Number.parseInt(req.query.hours || "24", 10);
    const hours = Number.isFinite(requestedHours)
      ? Math.max(1, Math.min(requestedHours, MAX_PUBLIC_HISTORY_HOURS))
      : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const where = { id: { in: vesselIds } };
    if (share.createdBy && share.createdBy !== "admin") where.account = share.createdBy;
    const vessels = await prisma.vessel.findMany({
      where,
      include: {
        positions: {
          where: { timestamp: { gte: since }, suspicious: false },
          orderBy: { timestamp: "desc" },
          take: 500,
        },
      },
    });

    res.json({
      label: share.label,
      vessels: vessels.map(v => ({
        id: v.id, mmsi: v.mmsi, name: v.name, alias: v.alias, color: v.color,
        positions: v.positions,
      })),
    });
  });

  return router;
}
