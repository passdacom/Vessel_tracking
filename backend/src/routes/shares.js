import express from "express";
import crypto from "crypto";

const ADMIN_PASSWORD = "kb1234";

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const password = auth.replace("Bearer ", "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export default function sharesRoutes(prisma) {
  const router = express.Router();

  // 관리자: 공유 링크 목록 조회
  router.get("/", requireAdmin, async (req, res) => {
    const shares = await prisma.sharedView.findMany({ orderBy: { createdAt: "desc" } });
    res.json(shares.map(s => ({ ...s, vesselIds: JSON.parse(s.vesselIds) })));
  });

  // 관리자: 공유 링크 생성
  router.post("/", requireAdmin, async (req, res) => {
    const { label, vesselIds } = req.body;
    if (!label || !vesselIds?.length) {
      return res.status(400).json({ error: "label and vesselIds are required" });
    }
    const token = crypto.randomBytes(12).toString("base64url");
    const share = await prisma.sharedView.create({
      data: { token, label, vesselIds: JSON.stringify(vesselIds) },
    });
    res.json({ ...share, vesselIds: JSON.parse(share.vesselIds) });
  });

  // 관리자: 공유 링크 삭제
  router.delete("/:token", requireAdmin, async (req, res) => {
    await prisma.sharedView.delete({ where: { token: req.params.token } }).catch(() => {});
    res.json({ ok: true });
  });

  // 공개: 토큰으로 선박 데이터 조회 (읽기 전용)
  router.get("/view/:token", async (req, res) => {
    const share = await prisma.sharedView.findUnique({ where: { token: req.params.token } });
    if (!share) return res.status(404).json({ error: "Invalid or expired link" });

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
