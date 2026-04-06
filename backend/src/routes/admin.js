import { Router } from "express";
import { getAccountNames, clearAccountCache } from "../accounts.js";

export default function adminRoutes(prisma) {
  const router = Router();

  // Admin only guard
  router.use((req, res, next) => {
    if (req.accountRole !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });

  // Overview: 계정별 선박 수, API 사용량
  router.get("/overview", async (req, res) => {
    try {
      const accountNames = await getAccountNames(prisma);

      // 계정별 선박 수
      const vesselCounts = await prisma.vessel.groupBy({
        by: ["account"],
        _count: true,
      });
      const countMap = {};
      vesselCounts.forEach((r) => { countMap[r.account] = r._count; });

      // 이번 달 API 사용량
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const monthlyUsage = await prisma.apiUsage.groupBy({
        by: ["account"],
        where: { createdAt: { gte: monthStart } },
        _sum: { credits: true },
      });
      const usageMap = {};
      monthlyUsage.forEach((r) => {
        const key = r.account || "system";
        usageMap[key] = (usageMap[key] || 0) + (r._sum.credits || 0);
      });

      // 총 사용량 (추적 시작 전 사용분 포함)
      const baseline = parseInt(process.env.API_CREDITS_BASELINE || "0", 10);
      const tracked = Object.values(usageMap).reduce((a, b) => a + b, 0);
      const totalUsed = baseline + tracked;

      // 일별 사용량 (최근 30일)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const dailyRaw = await prisma.$queryRaw`
        SELECT DATE("createdAt") as date, SUM(credits) as total
        FROM "ApiUsage"
        WHERE "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
        LIMIT 30
      `;
      const dailyUsage = dailyRaw.map((r) => ({
        date: r.date,
        credits: Number(r.total),
      }));

      const accounts = accountNames.map((name) => ({
        name,
        vesselCount: countMap[name] || 0,
        monthlyCredits: usageMap[name] || 0,
      }));

      res.json({
        accounts,
        api: {
          monthlyLimit: 20000,
          monthlyUsed: totalUsed,
          monthlyRemaining: Math.max(0, 20000 - totalUsed),
          systemUsed: usageMap["system"] || 0,
          dailyUsage,
        },
      });
    } catch (e) {
      console.error("[Admin] Overview error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // All vessels with account info
  router.get("/vessels", async (req, res) => {
    try {
      const vessels = await prisma.vessel.findMany({
        include: { positions: { orderBy: { timestamp: "desc" }, take: 1 } },
        orderBy: [{ account: "asc" }, { createdAt: "asc" }],
      });
      res.json(vessels);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Move vessel to different account
  router.patch("/vessels/:id/account", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ error: "Invalid vessel ID" });

      const { account } = req.body;
      const validAccounts = await getAccountNames(prisma);
      if (!validAccounts.includes(account)) {
        return res.status(400).json({ error: `유효한 계정: ${validAccounts.join(", ")}` });
      }

      const vessel = await prisma.vessel.update({
        where: { id },
        data: { account },
      });
      res.json(vessel);
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Vessel not found" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // List all accounts (for admin password management)
  router.get("/accounts", async (req, res) => {
    try {
      const accounts = await prisma.account.findMany({
        select: { id: true, name: true, role: true, createdAt: true },
        orderBy: { name: "asc" },
      });
      res.json(accounts);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Zone Events 조회 (진입/이탈 이력)
  router.get("/zone-events", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
      const offset = parseInt(req.query.offset || "0", 10);
      const eventType = req.query.eventType; // "entry" | "exit" | undefined
      const vesselId = req.query.vesselId ? parseInt(req.query.vesselId, 10) : undefined;
      const since = req.query.since ? new Date(req.query.since) : undefined;

      const where = {};
      if (eventType) where.eventType = eventType;
      if (vesselId) where.vesselId = vesselId;
      if (since) where.createdAt = { gte: since };

      const [events, total] = await Promise.all([
        prisma.zoneEvent.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
          include: {
            vessel: { select: { mmsi: true, name: true, alias: true, account: true } },
          },
        }),
        prisma.zoneEvent.count({ where }),
      ]);

      res.json({ events, total, limit, offset });
    } catch (e) {
      console.error("[Admin] zone-events error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Change account password (admin only)
  router.patch("/accounts/:name/password", async (req, res) => {
    try {
      const { name } = req.params;
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
      }
      await prisma.account.update({
        where: { name },
        data: { password: newPassword },
      });
      clearAccountCache();
      res.json({ success: true });
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "계정을 찾을 수 없습니다" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
