import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const data = [
  { timestamp: '2026-03-02T20:46:00Z', sog: 5.3, cog: 254, lat: 29.034567, lon: 48.260265 },
  { timestamp: '2026-03-02T20:41:00Z', sog: 6.0, cog: 256, lat: 29.036434, lon: 48.268734 },
  { timestamp: '2026-03-02T20:38:00Z', sog: 7.0, cog: 251, lat: 29.037951, lon: 48.274448 },
  { timestamp: '2026-03-02T20:31:00Z', sog: 9.5, cog: 275, lat: 29.043449, lon: 48.294998 },
  { timestamp: '2026-03-02T20:28:00Z', sog: 10.0, cog: 288, lat: 29.042467, lon: 48.300049 },
  { timestamp: '2026-03-02T20:17:00Z', sog: 11.3, cog: 294, lat: 29.029118, lon: 48.336433 },
  { timestamp: '2026-03-02T20:13:00Z', sog: 11.5, cog: 294, lat: 29.024401, lon: 48.348701 },
  { timestamp: '2026-03-02T20:02:00Z', sog: 11.5, cog: 294, lat: 29.010866, lon: 48.3825 },
  { timestamp: '2026-03-02T19:57:00Z', sog: 11.3, cog: 311, lat: 29.001833, lon: 48.401649 },
  { timestamp: '2026-03-02T19:52:00Z', sog: 11.6, cog: 313, lat: 28.99225, lon: 48.412167 },
  { timestamp: '2026-03-02T19:46:00Z', sog: 11.5, cog: 304, lat: 28.979116, lon: 48.431648 },
  { timestamp: '2026-03-02T19:42:00Z', sog: 11.6, cog: 303, lat: 28.972733, lon: 48.442467 },
  { timestamp: '2026-03-02T19:36:00Z', sog: 11.6, cog: 294, lat: 28.9618, lon: 48.463051 },
  { timestamp: '2026-03-02T19:32:00Z', sog: 11.8, cog: 276, lat: 28.95775, lon: 48.476566 },
  { timestamp: '2026-03-02T19:26:00Z', sog: 11.6, cog: 269, lat: 28.956434, lon: 48.497749 },
  { timestamp: '2026-03-02T19:17:00Z', sog: 8.6, cog: 228, lat: 28.9643, lon: 48.526184 },
  { timestamp: '2026-03-02T19:11:00Z', sog: 5.0, cog: 236, lat: 28.972084, lon: 48.53635 },
  { timestamp: '2026-03-02T19:07:00Z', sog: 2.7, cog: 243, lat: 28.97485, lon: 48.540634 },
  { timestamp: '2026-03-02T18:58:00Z', sog: 0.6, cog: 326, lat: 28.973717, lon: 48.543484 },
  { timestamp: '2026-03-02T18:55:00Z', sog: 1.1, cog: 343, lat: 28.972982, lon: 48.543915 }
];

async function main() {
  const mmsi = '352003212';
  const v = await prisma.vessel.findUnique({ where: { mmsi } });
  
  if (!v) {
    console.log('Vessel not found!');
    return;
  }
  
  const created = await prisma.position.createMany({
    data: data.map(d => ({
      ...d,
      vesselId: v.id,
      timestamp: new Date(d.timestamp)
    })),
    skipDuplicates: true,
  });
  
  console.log(`Successfully added ${created.count} HANYU historical positions`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
