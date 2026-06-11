import express from "express";
import crypto from "crypto";

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
    res.json(shares.map(s => ({ ...s, vesselIds: JSON.parse(s.vesselIds) })));
  });

  // 공유 링크 생성 (인증 사용자)
  router.post("/", requireAdmin, async (req, res) => {
    const { label, vesselIds } = req.body;
    if (!label || !vesselIds?.length) {
      return res.status(400).json({ error: "label and vesselIds are required" });
    }
    const token = crypto.randomBytes(12).toString("base64url");
    const share = await prisma.sharedView.create({
      data: { token, label, vesselIds: JSON.stringify(vesselIds), createdBy: req.account },
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

    const vesselIds = JSON.parse(share.vesselIds);
    const hours = parseInt(req.query.hours || "24");
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const vessels = await prisma.vessel.findMany({
      where: { id: { in: vesselIds } },
      include: {
        positions: {
          where: { timestamp: { gte: since } },
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
