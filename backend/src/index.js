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

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

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

// 인증 엔드포인트
app.post("/api/auth", async (req, res) => {
  const { password } = req.body;
  const account = await authenticate(prisma, password);
  if (!account) return res.status(401).json({ error: "Invalid password" });
  res.json({ account: account.name, role: account.role });
});

// 비밀번호 변경 엔드포인트
app.post("/api/account/change-password", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const account = token ? await authenticate(prisma, token) : null;
  if (!account) return res.status(401).json({ error: "Unauthorized" });

  const { targetAccount, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }
  if (newPassword.length > 50) {
    return res.status(400).json({ error: "비밀번호는 50자 이하여야 합니다" });
  }

  // 일반 유저는 자기 비밀번호만, admin은 모든 계정
  const target = targetAccount || account.name;
  if (account.role !== "admin" && target !== account.name) {
    return res.status(403).json({ error: "자신의 비밀번호만 변경할 수 있습니다" });
  }

  try {
    await prisma.account.update({
      where: { name: target },
      data: { password: newPassword },
    });
    clearAccountCache();
    res.json({ success: true, message: `${target} 계정의 비밀번호가 변경되었습니다` });
  } catch (e) {
    if (e.code === "P2025") return res.status(404).json({ error: "계정을 찾을 수 없습니다" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// 인증 미들웨어
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/shares/view/")) return next();
  if (req.path === "/api/auth") return next();
  if (req.path === "/api/account/change-password") return next();
  const token = req.headers.authorization?.split(" ")[1];
  const account = token ? await authenticate(prisma, token) : null;
  if (!account) return res.status(401).json({ error: "Unauthorized" });
  req.account = account.name;
  req.accountRole = account.role;
  next();
});

app.use("/api/vessels", vesselRoutes(prisma));
app.use("/api/shares", sharesRoutes(prisma));
app.use("/api/ports", portRoutes(prisma));
app.use("/api/admin", adminRoutes(prisma));
app.get("/api/health", (req, res) => res.json({ ok: true }));

// 수동 강제 업데이트 API (admin만 허용)
app.post("/api/force-update", async (req, res) => {
  if (req.accountRole !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  const { mmsiList } = req.body;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  const logger = (msg) => { res.write(msg + '\n'); };

  try {
    if (mmsiList && Array.isArray(mmsiList) && mmsiList.length > 0) {
      logger(`▶ 선택 선박 ${mmsiList.length}척 갱신: ${mmsiList.join(', ')}`);
      await datalasticPoller.forceUpdate(logger, mmsiList);
    } else {
      logger('▶ 전체 선박 강제 갱신 시작...');
      await datalasticPoller.forceUpdate(logger);
    }
    res.end();
  } catch (error) {
    logger(`❌ 오류 발생: ${error.message}`);
    res.end();
  }
});

const httpServer = createServer(app);
const wsServer = createWsServer(httpServer, prisma);

const datalasticPoller = createDatalasticPoller(prisma, (positionData) => {
  wsServer.broadcast({ type: "position", data: positionData });
});

async function init() {
  app.locals.wsServer = wsServer;
  startCleanupJob(prisma);
  datalasticPoller.start();

  // Seed accounts from ACCOUNTS env var if DB is empty
  const accountCount = await prisma.account.count();
  if (accountCount === 0 && process.env.ACCOUNTS) {
    for (const entry of process.env.ACCOUNTS.split(",")) {
      const [name, password] = entry.trim().split(":");
      if (!name || !password) continue;
      await prisma.account.create({ data: { name, password, role: name === "admin" ? "admin" : "user" } });
    }
    console.log("[ACCOUNTS] Seeded from env var");
  }

  const vessels = await prisma.vessel.findMany();
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`📡 Tracking ${vessels.length} vessel(s) via Datalastic`);
  });
}

init().catch((e) => { console.error("Failed to start:", e); process.exit(1); });
process.on("SIGINT", async () => { datalasticPoller.stop(); await prisma.$disconnect(); process.exit(0); });
