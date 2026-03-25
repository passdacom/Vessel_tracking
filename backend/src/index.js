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
import { authenticate } from "./accounts.js";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

// CORS: 실제 인증은 Bearer 토큰이 담당. Nginx→Docker→Express 프록시 구조상
// 브라우저 Origin이 서버 IP가 되어 whitelist 방식이 동작하지 않음.
app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

// force-update: 15분 내 5회 초과 → 429 (API 크레딧 소모 방지 + 브루트포스 방지)
const forceUpdateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many update requests, please try again later" },
});
app.use("/api/force-update", forceUpdateLimiter);

// history fetch: 15분 내 10회 초과 → 429 (API 크레딧 소모 방지)
const historyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many history requests, please try again later" },
});
app.use("/api/vessels/:id/history", historyLimiter);

// 인증 엔드포인트 (로그인 시 계정 정보 반환)
app.post("/api/auth", (req, res) => {
  const { password } = req.body;
  const account = authenticate(password);
  if (!account) return res.status(401).json({ error: "Invalid password" });
  res.json({ account: account.name, role: account.role });
});

// 공유 링크 공개 조회(/api/shares/view/*)만 인증 제외, 나머지는 필수 인증
app.use((req, res, next) => {
  if (req.path.startsWith("/api/shares/view/")) return next();
  if (req.path === "/api/auth") return next();
  const token = req.headers.authorization?.split(" ")[1];
  const account = token ? authenticate(token) : null;
  if (!account) return res.status(401).json({ error: "Unauthorized" });
  req.account = account.name;  // "kb", "kdgc", "admin"
  req.accountRole = account.role; // "user", "admin"
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

  const logger = (msg) => {
    res.write(msg + '\n');
  };

  try {
    // mmsiList가 있으면 해당 선박만, 없으면 전체 갱신
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
const wsServer = createWsServer(httpServer);

// Datalastic 폴러 초기화
const datalasticPoller = createDatalasticPoller(prisma, (positionData) => {
  wsServer.broadcast({ type: "position", data: positionData });
});

async function init() {
  // wsServer 노출 (라우터에서 브로드캐스트 가능하도록)
  app.locals.wsServer = wsServer;

  startCleanupJob(prisma);
  datalasticPoller.start();

  const vessels = await prisma.vessel.findMany();
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`📡 Tracking ${vessels.length} vessel(s) via Datalastic`);
  });
}

init().catch((e) => {
  console.error("Failed to start:", e);
  process.exit(1);
});

process.on("SIGINT", async () => {
  datalasticPoller.stop();
  await prisma.$disconnect();
  process.exit(0);
});
