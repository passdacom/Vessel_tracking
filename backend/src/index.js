import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { PrismaClient } from "@prisma/client";
import vesselRoutes from "./routes/vessels.js";
import sharesRoutes from "./routes/shares.js";
import { createWsServer } from "./services/wsServer.js";
import { createDatalasticPoller } from "./services/datalasticPoller.js";
import { startCleanupJob } from "./services/cleanup.js";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

// 공유 링크는 인증 제외
app.use((req, res, next) => {
  if (req.path.startsWith("/api/shares")) return next();
  if (!process.env.AUTH_PASSWORD) return next();
  const token = req.headers.authorization?.split(" ")[1];
  if (token === process.env.AUTH_PASSWORD) return next();
  res.status(401).json({ error: "Unauthorized" });
});

app.use("/api/vessels", vesselRoutes(prisma));
app.use("/api/shares", sharesRoutes(prisma));
app.get("/api/health", (req, res) => res.json({ ok: true }));

// 수동 강제 업데이트 API (별도 비밀번호 "880715" 요구)
app.post("/api/force-update", async (req, res) => {
  const { password, mmsiList } = req.body;
  if (password !== "880715") {
    return res.status(401).json({ error: "Invalid password for manual update" });
  }

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
