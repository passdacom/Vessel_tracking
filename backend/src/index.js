import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { PrismaClient } from "@prisma/client";
import vesselRoutes from "./routes/vessels.js";
import sharesRoutes from "./routes/shares.js";
import portRoutes from "./routes/ports.js";
import adminRoutes from "./routes/admin.js";
import { createWsServer } from "./services/wsServer.js";
import { createDatalasticPoller } from "./services/datalasticPoller.js";
import { startCleanupJob } from "./services/cleanup.js";
import { authenticate, clearAccountCache } from "./accounts.js";
import { createSession, invalidateAccount } from "./sessions.js";
import { geofenceChecker } from "./services/geofenceChecker.js";
import { logger } from "./utils/logger.js";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGINS 환경변수로 허용 오리진 지정, 없으면 전체 허용(하위 호환)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: allowedOrigins
      ? (origin, callback) => {
          // origin이 없으면(서버간 요청, curl 등) 허용
          if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
          callback(null, false);
        }
      : true,
    credentials: false,
  })
);
app.use(express.json());

// ── Rate Limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "로그인 시도 횟수 초과, 15분 후 다시 시도하세요" },
  skip: (req) => !req.ip, // IP 없으면 스킵
});

const forceUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many update requests, please try again later" },
});
app.use("/api/force-update", forceUpdateLimiter);

const historyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many history requests, please try again later" },
});
app.use("/api/vessels/:id/history", historyLimiter);

// ── 인증 엔드포인트 ────────────────────────────────────────────────────────────
app.post("/api/auth", authLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "비밀번호를 입력해주세요" });
    const account = await authenticate(prisma, password);
    if (!account) return res.status(401).json({ error: "Invalid password" });
    const token = createSession(account.name, account.role);
    logger.info(`[Auth] 로그인 성공: ${account.name} (${req.ip})`);
    res.json({ account: account.name, role: account.role, token });
  } catch (e) {
    logger.error("[Auth] 로그인 오류:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── 비밀번호 변경 엔드포인트 ───────────────────────────────────────────────────
app.post("/api/account/change-password", async (req, res) => {
  const rawToken = req.headers.authorization?.split(" ")[1];
  const account = rawToken ? await authenticate(prisma, rawToken) : null;
  if (!account) return res.status(401).json({ error: "Unauthorized" });

  const { targetAccount, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }
  if (newPassword.length > 50) {
    return res.status(400).json({ error: "비밀번호는 50자 이하여야 합니다" });
  }

  const target = targetAccount || account.name;
  if (account.role !== "admin" && target !== account.name) {
    return res.status(403).json({ error: "자신의 비밀번호만 변경할 수 있습니다" });
  }

  try {
    await prisma.account.update({ where: { name: target }, data: { password: newPassword } });
    clearAccountCache();
    invalidateAccount(target); // 기존 세션 즉시 무효화
    logger.info(`[Auth] 비밀번호 변경: ${target} by ${account.name}`);
    res.json({ success: true, message: `${target} 계정의 비밀번호가 변경되었습니다` });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "계정을 찾을 수 없습니다" });
    logger.error("[Auth] 비밀번호 변경 오류:", e.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── 인증 미들웨어 ──────────────────────────────────────────────────────────────
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/shares/view/")) return next();
  if (req.path === "/api/auth") return next();
  if (req.path === "/api/account/change-password") return next();
  try {
    const rawToken = req.headers.authorization?.split(" ")[1];
    const account = rawToken ? await authenticate(prisma, rawToken) : null;
    if (!account) return res.status(401).json({ error: "Unauthorized" });
    req.account = account.name;
    req.accountRole = account.role;
    next();
  } catch (e) {
    logger.error("[auth middleware] error:", e.message);
    res.status(500).json({ error: "Authentication error" });
  }
});

app.use("/api/vessels", vesselRoutes(prisma));
app.use("/api/shares", sharesRoutes(prisma));
app.use("/api/ports", portRoutes(prisma));
app.use("/api/admin", adminRoutes(prisma));
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ── 수동 강제 업데이트 (admin) ─────────────────────────────────────────────────
app.post("/api/force-update", async (req, res) => {
  if (req.accountRole !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  const { mmsiList } = req.body;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  const logFn = (msg) => { res.write(msg + "\n"); };

  try {
    if (mmsiList && Array.isArray(mmsiList) && mmsiList.length > 0) {
      logFn(`▶ 선택 선박 ${mmsiList.length}척 갱신: ${mmsiList.join(", ")}`);
      await datalasticPoller.forceUpdate(logFn, mmsiList);
    } else {
      logFn("▶ 전체 선박 강제 갱신 시작...");
      await datalasticPoller.forceUpdate(logFn);
    }
    res.end();
  } catch (error) {
    logger.error("[force-update] 오류:", error.message);
    logFn(`❌ 오류 발생: ${error.message}`);
    res.end();
  }
});

const httpServer = createServer(app);
const wsServer = createWsServer(httpServer, prisma);

const datalasticPoller = createDatalasticPoller(prisma, (positionData) => {
  wsServer.broadcast({ type: "position", data: positionData });
}, (vesselData) => {
  wsServer.broadcastToAccount({ type: "vessel_updated", data: vesselData }, vesselData.account);
}, (zoneEventData) => {
  wsServer.broadcastToAccount({ type: "zone_event", data: zoneEventData }, zoneEventData.account || "");
});

async function init() {
  app.locals.wsServer = wsServer;
  app.locals.poller = datalasticPoller;
  startCleanupJob(prisma);

  geofenceChecker.loadZones();
  await geofenceChecker.initState(prisma);

  datalasticPoller.start();

  const accountCount = await prisma.account.count();
  if (accountCount === 0 && process.env.ACCOUNTS) {
    for (const entry of process.env.ACCOUNTS.split(",")) {
      const [name, password] = entry.trim().split(":");
      if (!name || !password) continue;
      await prisma.account.create({ data: { name, password, role: name === "admin" ? "admin" : "user" } });
    }
    logger.info("[ACCOUNTS] Seeded from env var");
  }

  const vessels = await prisma.vessel.findMany();
  httpServer.listen(PORT, "0.0.0.0", () => {
    logger.info(`✅ Server running at http://0.0.0.0:${PORT}`);
    logger.info(`📡 Tracking ${vessels.length} vessel(s) via Datalastic`);
  });
}

init().catch((e) => { logger.error("Failed to start:", e); process.exit(1); });
process.on("SIGINT", async () => { datalasticPoller.stop(); await prisma.$disconnect(); process.exit(0); });
process.on("uncaughtException", (err) => { logger.error("[uncaughtException]", err); });
process.on("unhandledRejection", (reason) => { logger.error("[unhandledRejection]", reason); });
