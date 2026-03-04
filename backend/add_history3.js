import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const data = [{"timestamp": "2026-03-03T03:53:00Z", "sog": 0.0, "cog": 316, "lat": 29.037733, "lon": 48.175632}, {"timestamp": "2026-03-03T03:29:00Z", "sog": 0.0, "cog": 316, "lat": 29.037701, "lon": 48.175652}, {"timestamp": "2026-03-03T03:05:00Z", "sog": 0.0, "cog": 316, "lat": 29.037701, "lon": 48.175667}, {"timestamp": "2026-03-03T02:41:00Z", "sog": 0.0, "cog": 316, "lat": 29.037716, "lon": 48.175652}, {"timestamp": "2026-03-03T02:14:00Z", "sog": 0.0, "cog": 316, "lat": 29.037701, "lon": 48.175667}, {"timestamp": "2026-03-03T01:50:00Z", "sog": 0.0, "cog": 32, "lat": 29.037733, "lon": 48.175667}, {"timestamp": "2026-03-03T01:26:00Z", "sog": 0.0, "cog": 32, "lat": 29.037716, "lon": 48.175652}, {"timestamp": "2026-03-03T00:59:00Z", "sog": 0.0, "cog": 58, "lat": 29.037716, "lon": 48.175682}, {"timestamp": "2026-03-03T00:35:00Z", "sog": 0.0, "cog": 5, "lat": 29.037701, "lon": 48.175667}, {"timestamp": "2026-03-03T00:11:00Z", "sog": 0.0, "cog": 335, "lat": 29.03775, "lon": 48.175652}];

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
