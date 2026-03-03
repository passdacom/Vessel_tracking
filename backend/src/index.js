import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import vesselRoutes from './routes/vessels.js';
import sharesRoutes from './routes/shares.js';
import { createWsServer } from './services/wsServer.js';
import { createAisClient } from './services/aisStream.js';
import { startCleanupJob } from './services/cleanup.js';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/api/vessels', vesselRoutes(prisma));
app.use('/api/shares', sharesRoutes(prisma));
app.get('/api/health', (req, res) => {
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth === 'kb1234') return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});

const httpServer = createServer(app);
const wsServer = createWsServer(httpServer);

const aisClient = createAisClient(prisma, (positionData) => {
  wsServer.broadcast({ type: 'position', data: positionData });
});

async function init() {
  const vessels = await prisma.vessel.findMany();
  app.locals.aisClient = aisClient;
  app.locals.wsServer = wsServer;

  if (vessels.length > 0) {
    aisClient.subscribe(vessels.map(v => v.mmsi));
  }

  startCleanupJob(prisma);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('Server running at http://0.0.0.0:' + PORT);
    console.log('Tracking ' + vessels.length + ' vessel(s)');
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
