import { Router } from "express";
import { VESSEL_COLORS } from "../utils/colors.js";

export default function vesselRoutes(prisma) {
  const router = Router();

  // List all vessels
  router.get("/", async (req, res) => {
    try {
      const vessels = await prisma.vessel.findMany({
        include: { positions: { orderBy: { timestamp: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      });
      res.json(vessels);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Get position history
  router.get("/:id/positions", async (req, res) => {
    try {
      const { id } = req.params;
      const hours = parseInt(req.query.hours) || 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      let positions = await prisma.position.findMany({
        where: { vesselId: parseInt(id), timestamp: { gte: since } },
        orderBy: { timestamp: "desc" },
        take: 2000,
      });

      // 만약 조회 기간 내 데이터가 하나도 없다면, 가장 최근 데이터 1건만 조회해서 포함
      if (positions.length === 0) {
        const latest = await prisma.position.findFirst({
          where: { vesselId: parseInt(id) },
          orderBy: { timestamp: "desc" },
        });
        if (latest) {
          positions = [latest];
        }
      }

      res.json(positions);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Manual position entry ← NEW
  router.post("/:id/positions", async (req, res) => {
    try {
      const { id } = req.params;
      const { lat, lon, cog, sog, heading, timestamp } = req.body;

      if (!lat || !lon) {
        return res.status(400).json({ error: "Latitude and Longitude are required" });
      }

      const vessel = await prisma.vessel.findUnique({ where: { id: parseInt(id) } });
      if (!vessel) return res.status(404).json({ error: "Vessel not found" });

      const position = await prisma.position.create({
        data: {
          vesselId: parseInt(id),
          lat: parseFloat(lat),
          lon: parseFloat(lon),
          cog: cog != null ? parseFloat(cog) : null,
          sog: sog != null ? parseFloat(sog) : null,
          heading: heading != null ? parseFloat(heading) : null,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
        },
      });

      console.log(`[Manual] Position added for vessel ${id}: ${lat},${lon}`);

      req.app.locals.wsServer?.broadcast({
        type: "position",
        data: {
          vesselId: vessel.id,
          mmsi: vessel.mmsi,
          name: vessel.name || vessel.alias,
          ...position,
        },
      });

      res.status(201).json(position);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Add vessel
  router.post("/", async (req, res) => {
    try {
      const { mmsi, alias, color } = req.body;
      if (!mmsi || !/^\d{9}$/.test(mmsi)) {
        return res.status(400).json({ error: "Valid 9-digit MMSI required" });
      }
      const existingCount = await prisma.vessel.count();
      const assignedColor = color || VESSEL_COLORS[existingCount % VESSEL_COLORS.length];
      const vessel = await prisma.vessel.create({
        data: { mmsi, alias: alias || null, color: assignedColor },
      });
      const allVessels = await prisma.vessel.findMany();

      req.app.locals.wsServer?.broadcast({ type: "vessel_added", data: vessel });
      res.status(201).json(vessel);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "Vessel already registered" });
      res.status(500).json({ error: e.message });
    }
  });

  // Update vessel
  router.patch("/:id", async (req, res) => {
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
      req.app.locals.wsServer?.broadcast({ type: "vessel_updated", data: vessel });
      res.json(vessel);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Delete vessel
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.vessel.delete({ where: { id: parseInt(id) } });
      const allVessels = await prisma.vessel.findMany();

      req.app.locals.wsServer?.broadcast({ type: "vessel_removed", data: { id: parseInt(id) } });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
