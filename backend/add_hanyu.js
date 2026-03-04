import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function add() {
  const mmsi = '352003212';
  const name = 'HANYU CAMELLIA';
  let v = await prisma.vessel.findUnique({ where: { mmsi } });
  if (!v) {
    v = await prisma.vessel.create({ data: { mmsi, name, alias: name, color: '#f59e0b' } });
    console.log('Created vessel:', v.id);
  } else {
    console.log('Found vessel:', v.id);
  }
  const pos = await prisma.position.create({
    data: {
      vesselId: v.id,
      timestamp: new Date('2026-03-02T23:47:00Z'),
      lat: 29.037716,
      lon: 48.175617,
      sog: 0.0,
      cog: 321
    }
  });
  console.log('Added position:', pos.id);
}
add().catch(console.error).finally(() => prisma.$disconnect());
