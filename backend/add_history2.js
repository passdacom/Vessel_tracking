import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const data = [{"timestamp": "2026-03-01T03:43:00Z", "sog": 0.1, "cog": 259, "lat": 29.032097, "lon": 48.249065}, {"timestamp": "2026-03-01T03:17:00Z", "sog": 0.0, "cog": 292, "lat": 29.032101, "lon": 48.249084}, {"timestamp": "2026-03-01T02:53:00Z", "sog": 0.1, "cog": 278, "lat": 29.032084, "lon": 48.249016}, {"timestamp": "2026-03-01T02:32:00Z", "sog": 0.1, "cog": 317, "lat": 29.032084, "lon": 48.249134}, {"timestamp": "2026-03-01T02:11:00Z", "sog": 0.0, "cog": 341, "lat": 29.032084, "lon": 48.249084}, {"timestamp": "2026-03-01T01:50:00Z", "sog": 0.2, "cog": 88, "lat": 29.032116, "lon": 48.2491}, {"timestamp": "2026-03-01T01:26:00Z", "sog": 0.0, "cog": 92, "lat": 29.032049, "lon": 48.249416}, {"timestamp": "2026-03-01T01:02:00Z", "sog": 0.0, "cog": 63, "lat": 29.032034, "lon": 48.249466}, {"timestamp": "2026-03-01T00:38:00Z", "sog": 0.0, "cog": 163, "lat": 29.032066, "lon": 48.249649}, {"timestamp": "2026-03-01T00:13:00Z", "sog": 0.1, "cog": 281, "lat": 29.032084, "lon": 48.249882}];

async function main() {
  const mmsi = '352003212';
  const v = await prisma.vessel.findUnique({ where: { mmsi } });
  
  if (!v) {
    console.log('Vessel not found!');
    process.exit(1);
  }
  
  let i = 0;
  for (const d of data) {
    await prisma.position.create({
      data: {
        ...d,
        vesselId: v.id,
        timestamp: new Date(d.timestamp)
      }
    });
    i++;
  }
  console.log('Successfully added ' + i + ' historical positions for ' + v.name);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
