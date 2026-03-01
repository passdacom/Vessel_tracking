import { Router } from 'express';
import { VESSEL_COLORS } from '../utils/colors.js';

export default function vesselRoutes(prisma) {
  const router = Router();

  // List all vessels with latest position
  router.get('/', async (req, res) => {
    try {
      const vessels = await prisma.vessel.findMany({
        include: {
          positions: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      res.json(vessels);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get position history for a vessel
  router.get('/:id/positions', async (req, res) => {
    try {
      const { id } = req.params;
      const hours = parseInt(req.query.hours) || 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const positions = await prisma.position.findMany({
        where: {
          vesselId: parseInt(id),
          timestamp: { gte: since },
        },
        orderBy: { timestamp: 'desc' },
        take: 2000,
      });
      res.json(positions);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Add a vessel by MMSI
  router.post('/', async (req, res) => {
    try {
      const { mmsi, alias, color } = req.body;

      if (!mmsi || !/^\d{9}$/.test(mmsi)) {
        return res.status(400).json({ error: '유효한 9자리 MMSI가 필요합니다' });
      }

      const existingCount = await prisma.vessel.count();
      const assignedColor = color || VESSEL_COLORS[existingCount % VESSEL_COLORS.length];

      const vessel = await prisma.vessel.create({
        data: { mmsi, alias: alias || null, color: assignedColor },
      });

      const allVessels = await prisma.vessel.findMany();
      req.app.locals.aisClient?.subscribe(allVessels.map(v => v.mmsi));
      req.app.locals.wsServer?.broadcast({ type: 'vessel_added', data: vessel });

      res.status(201).json(vessel);
    } catch (e) {
      if (e.code === 'P2002') {
        return res.status(409).json({ error: '이미 등록된 선박입니다' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // Update vessel alias or color
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { alias, color } = req.body;

      const vessel = await prisma.vessel.update({
        where: { id: parseInt(id) },
        data: {
          ...(alias !== undefined && { alias: alias || null }),
          ...(color !== undefined && { color }),
        },
      });

      req.app.locals.wsServer?.broadcast({ type: 'vessel_updated', data: vessel });
      res.json(vessel);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete a vessel
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.vessel.delete({ where: { id: parseInt(id) } });

      const allVessels = await prisma.vessel.findMany();
      req.app.locals.aisClient?.subscribe(allVessels.map(v => v.mmsi));
      req.app.locals.wsServer?.broadcast({ type: 'vessel_removed', data: { id: parseInt(id) } });

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}
