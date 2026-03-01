import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import vesselRoutes from './routes/vessels.js';
import { createWsServer } from './services/wsServer.js';
import { createAisClient } from './services/aisStream.js';
import { startCleanupJob } from './services/cleanup.js';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

// Simple shared-password auth
app.use((req, res, next) => {
  if (!process.env.AUTH_PASSWORD) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token === process.env.AUTH_PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
});

app.use('/api/vessels', vesselRoutes(prisma));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const wsServer = createWsServer(httpServer);

const aisClient = createAisClient(prisma, (positionData) => {
  wsServer.broadcast({ type: 'position', data: positionData });
});

async function init() {
  const vessels = await prisma.vessel.findMany();

  // Expose to routes for dynamic MMSI updates
  app.locals.aisClient = aisClient;
  app.locals.wsServer = wsServer;

  if (vessels.length > 0) {
    aisClient.subscribe(vessels.map(v => v.mmsi));
  }

  startCleanupJob(prisma);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running at http://0.0.0.0:${PORT}`);
    console.log(`📡 Tracking ${vessels.length} vessel(s)`);
  });
}

init().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
});

process.on('SIGINT', async () => {
  aisClient.disconnect();
  await prisma.$disconnect();
  process.exit(0);
});
