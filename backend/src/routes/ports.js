import { Router } from "express";

function parseId(idStr) {
  const id = parseInt(idStr, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function portRoutes(prisma) {
  const router = Router();

  // List all ports (optional ?q= search)
  router.get("/", async (req, res) => {
    try {
      const q = req.query.q?.trim();
      const ports = await prisma.port.findMany({
        where: q ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameKo: { contains: q, mode: "insensitive" } },
            { country: { contains: q, mode: "insensitive" } },
            { unlocode: { contains: q, mode: "insensitive" } },
          ],
        } : undefined,
        orderBy: { name: "asc" },
      });
      res.json(ports);
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  // Add port
  router.post("/", async (req, res) => {
    try {
      const { name, nameKo, unlocode, lat, lon, country } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0)
        return res.status(400).json({ error: "항구명은 필수입니다" });
      const latF = parseFloat(lat), lonF = parseFloat(lon);
      if (isNaN(latF) || latF < -90 || latF > 90)
        return res.status(400).json({ error: "위도(lat)는 -90~90 범위여야 합니다" });
      if (isNaN(lonF) || lonF < -180 || lonF > 180)
        return res.status(400).json({ error: "경도(lon)는 -180~180 범위여야 합니다" });

      const port = await prisma.port.create({
        data: {
          name: name.trim(),
          nameKo: nameKo?.trim() || null,
          unlocode: unlocode?.trim().toUpperCase() || null,
          lat: latF,
          lon: lonF,
          country: country?.trim() || null,
        },
      });
      res.status(201).json(port);
    } catch (e) {
      if (e.code === "P2002") return res.status(409).json({ error: "동일한 UNLOCODE가 이미 존재합니다" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete port
  router.delete("/:id", async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid port ID" });
      await prisma.port.delete({ where: { id } });
      res.json({ success: true });
    } catch (e) {
      if (e.code === "P2025") return res.status(404).json({ error: "Port not found" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
