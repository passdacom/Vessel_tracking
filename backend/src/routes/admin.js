import { Router } from "express";
import { getAccountNames, clearAccountCache } from "../accounts.js";
import { invalidateAccount } from "../sessions.js";
import { logger } from "../utils/logger.js";

export default function adminRoutes(prisma) {
  const router = Router();

  // Admin only guard
  router.use((req, res, next) => {
    if (req.accountRole !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });

  // ── Overview ───────────────────────────────────────────────────────────────
  router.get("/overview", async (req, res) => {
    try {
      const accounts = await prisma.account.findMany({
        where: { role: "user" },
        select: { name: true, vesselLimit: true },
      });
      const accountNames = accounts.map((a) => a.name);
      const limitMap = Object.fromEntries(accounts.map((a) => [a.name, a.vesselLimit]));

      const vesselCounts = await prisma.vessel.groupBy({ by: ["account"], _count: true });
      const countMap = {};
      vesselCounts.forEach((r) => { countMap[r.account] = r._count; });

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

      const baseline = parseInt(process.env.API_CREDITS_BASELINE || "0", 10);
      const tracked = Object.values(usageMap).reduce((a, b) => a + b, 0);
      const totalUsed = baseline + tracked;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const dailyRaw = await prisma.$queryRaw`
        SELECT DATE("createdAt") as date, SUM(credits) as total
        FROM "ApiUsage"
        WHERE "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
        LIMIT 30
      `;
      const dailyUsage = dailyRaw.map((r) => ({ date: r.date, credits: Number(r.total) }));

      const accountList = accountNames.map((name) => ({
        name,
        vesselCount: countMap[name] || 0,
        vesselLimit: limitMap[name] ?? 100,
        monthlyCredits: usageMap[name] || 0,
      }));

      res.json({
        accounts: accountList,
        api: {
          monthlyLimit: 20000, monthlyUsed: totalUsed,
          monthlyRemaining: Math.max(0, 20000 - totalUsed),
          systemUsed: usageMap["system"] || 0, dailyUsage,
        },
      });
    } catch (e) {
      logger.error("[Admin] Overview error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── All vessels ────────────────────────────────────────────────────────────
  router.get("/vessels", async (req, res) => {
    try {
      const vessels = await prisma.vessel.findMany({
        include: { positions: { orderBy: { timestamp: "desc" }, take: 1 } },
        orderBy: [{ account: "asc" }, { createdAt: "asc" }],
      });
      res.json(vessels);
    } catch (e) {
      logger.error("[Admin] vessels error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
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
      const vessel = await prisma.vessel.update({ where: { id }, data: { account } });
      res.json(vessel);
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Vessel not found" });
      logger.error("[Admin] move vessel error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Accounts CRUD ──────────────────────────────────────────────────────────

  // List all accounts
  router.get("/accounts", async (req, res) => {
    try {
      const accounts = await prisma.account.findMany({
        select: { id: true, name: true, role: true, vesselLimit: true, createdAt: true },
        orderBy: { name: "asc" },
      });
      res.json(accounts);
    } catch (e) {
      logger.error("[Admin] accounts list error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create account
  router.post("/accounts", async (req, res) => {
    try {
      const { name, password, vesselLimit } = req.body;
      if (!name || !/^[a-zA-Z0-9_]{2,30}$/.test(name)) {
        return res.status(400).json({ error: "계정명은 2~30자 영문/숫자/밑줄만 허용됩니다" });
      }
      if (!password || password.length < 4) {
        return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
      }
      if (password.length > 50) {
        return res.status(400).json({ error: "비밀번호는 50자 이하여야 합니다" });
      }
      const limit = vesselLimit != null ? parseInt(vesselLimit, 10) : 100;
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return res.status(400).json({ error: "선박 한도는 1~1000 사이여야 합니다" });
      }
      const account = await prisma.account.create({
        data: { name, password, role: "user", vesselLimit: limit },
        select: { id: true, name: true, role: true, vesselLimit: true, createdAt: true },
      });
      clearAccountCache();
      logger.info(`[Admin] 계정 생성: ${name} (limit: ${limit})`);
      res.status(201).json(account);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "이미 존재하는 계정명입니다" });
      logger.error("[Admin] account create error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete account
  router.delete("/accounts/:name", async (req, res) => {
    try {
      const { name } = req.params;
      if (name === "admin") {
        return res.status(400).json({ error: "admin 계정은 삭제할 수 없습니다" });
      }
      // 해당 계정의 선박 수 확인
      const vesselCount = await prisma.vessel.count({ where: { account: name } });
      if (vesselCount > 0) {
        return res.status(400).json({
          error: `계정에 선박 ${vesselCount}척이 있습니다. 먼저 선박을 이동하거나 삭제해주세요.`,
        });
      }
      await prisma.account.delete({ where: { name } });
      clearAccountCache();
      logger.info(`[Admin] 계정 삭제: ${name}`);
      res.json({ success: true });
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "계정을 찾을 수 없습니다" });
      logger.error("[Admin] account delete error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Change account password
  router.patch("/accounts/:name/password", async (req, res) => {
    try {
      const { name } = req.params;
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
      }
      await prisma.account.update({ where: { name }, data: { password: newPassword } });
      clearAccountCache();
      invalidateAccount(name); // 기존 세션 즉시 무효화
      logger.info(`[Admin] 비밀번호 변경: ${name}`);
      res.json({ success: true });
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "계정을 찾을 수 없습니다" });
      logger.error("[Admin] password change error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update vessel limit
  router.patch("/accounts/:name/vessel-limit", async (req, res) => {
    try {
      const { name } = req.params;
      const { vesselLimit } = req.body;
      const limit = parseInt(vesselLimit, 10);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return res.status(400).json({ error: "선박 한도는 1~1000 사이여야 합니다" });
      }
      const account = await prisma.account.update({
        where: { name },
        data: { vesselLimit: limit },
        select: { id: true, name: true, vesselLimit: true },
      });
      clearAccountCache();
      logger.info(`[Admin] 선박 한도 변경: ${name} → ${limit}`);
      res.json(account);
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "계정을 찾을 수 없습니다" });
      logger.error("[Admin] vessel-limit update error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Zone Events ────────────────────────────────────────────────────────────
  router.get("/zone-events", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
      const offset = parseInt(req.query.offset || "0", 10);
      const eventType = req.query.eventType;
      const vesselId = req.query.vesselId ? parseInt(req.query.vesselId, 10) : undefined;
      const since = req.query.since ? new Date(req.query.since) : undefined;

      const where = {};
      if (eventType) where.eventType = eventType;
      if (vesselId) where.vesselId = vesselId;
      if (since) where.createdAt = { gte: since };

      const [events, total] = await Promise.all([
        prisma.zoneEvent.findMany({
          where, orderBy: { createdAt: "desc" },
          skip: offset, take: limit,
          include: { vessel: { select: { mmsi: true, name: true, alias: true, account: true } } },
        }),
        prisma.zoneEvent.count({ where }),
      ]);
      res.json({ events, total, limit, offset });
    } catch (e) {
      logger.error("[Admin] zone-events error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── System Settings (폴링 스케줄 등) ─────────────────────────────────────

  // Get settings
  router.get("/settings", async (req, res) => {
    try {
      const configs = await prisma.systemConfig.findMany();
      const settings = Object.fromEntries(configs.map((c) => [c.key, c.value]));
      // 기본값 포함
      res.json({
        poll_cron: settings.poll_cron || "0 4,6,8,11,15,23 * * *",
        poll_enabled: settings.poll_enabled !== "false",
        ...settings,
      });
    } catch (e) {
      logger.error("[Admin] get settings error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update settings
  router.put("/settings", async (req, res) => {
    try {
      const { poll_cron, poll_enabled } = req.body;
      const updates = [];

      if (poll_cron !== undefined) {
        // cron 유효성: 기본 검증 (5~6 필드)
        const parts = String(poll_cron).trim().split(/\s+/);
        if (parts.length < 5 || parts.length > 6) {
          return res.status(400).json({ error: "유효한 cron 표현식이 아닙니다 (예: 0 4,6,8,11,15,23 * * *)" });
        }
        updates.push(
          prisma.systemConfig.upsert({
            where: { key: "poll_cron" },
            update: { value: String(poll_cron).trim() },
            create: { key: "poll_cron", value: String(poll_cron).trim() },
          })
        );
      }

      if (poll_enabled !== undefined) {
        updates.push(
          prisma.systemConfig.upsert({
            where: { key: "poll_enabled" },
            update: { value: String(poll_enabled) },
            create: { key: "poll_enabled", value: String(poll_enabled) },
          })
        );
      }

      await Promise.all(updates);

      // 폴러에 변경 적용
      const poller = req.app.locals.poller;
      if (poller && poll_cron) {
        if (poll_enabled === false || poll_enabled === "false") {
          poller.stop();
          logger.info("[Admin] 폴링 비활성화");
        } else {
          poller.reload(String(poll_cron).trim());
        }
      } else if (poller && poll_enabled === false) {
        poller.stop();
        logger.info("[Admin] 폴링 비활성화");
      } else if (poller && poll_enabled === true && poll_cron === undefined) {
        // enabled만 바뀐 경우 현재 cron으로 재시작
        const cfg = await prisma.systemConfig.findUnique({ where: { key: "poll_cron" } });
        const cronExpr = cfg?.value || "0 4,6,8,11,15,23 * * *";
        poller.reload(cronExpr);
        logger.info("[Admin] 폴링 활성화");
      }

      const result = await prisma.systemConfig.findMany();
      res.json(Object.fromEntries(result.map((c) => [c.key, c.value])));
    } catch (e) {
      logger.error("[Admin] update settings error:", e.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
