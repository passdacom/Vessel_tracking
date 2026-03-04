import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const data = [{"mmsi": "352003212", "timestamp": "2026-03-03T08:52:00Z", "sog": 0.0, "cog": 318, "lat": 29.037733, "lon": 48.175652}, {"mmsi": "352003212", "timestamp": "2026-03-03T08:28:00Z", "sog": 0.0, "cog": 112, "lat": 29.037767, "lon": 48.175617}, {"mmsi": "352003212", "timestamp": "2026-03-03T08:04:00Z", "sog": 0.0, "cog": 112, "lat": 29.037716, "lon": 48.175667}, {"mmsi": "352003212", "timestamp": "2026-03-03T07:37:00Z", "sog": 0.0, "cog": 112, "lat": 29.037733, "lon": 48.175652}, {"mmsi": "352003212", "timestamp": "2026-03-03T07:07:00Z", "sog": 0.0, "cog": 112, "lat": 29.037733, "lon": 48.175652}, {"mmsi": "352003212", "timestamp": "2026-03-03T06:43:00Z", "sog": 0.0, "cog": 112, "lat": 29.037733, "lon": 48.175652}, {"mmsi": "352003212", "timestamp": "2026-03-03T06:16:00Z", "sog": 0.0, "cog": 278, "lat": 29.037701, "lon": 48.175667}, {"mmsi": "352003212", "timestamp": "2026-03-03T05:52:00Z", "sog": 0.0, "cog": 227, "lat": 29.03775, "lon": 48.175632}, {"mmsi": "352003212", "timestamp": "2026-03-03T05:28:00Z", "sog": 0.0, "cog": 227, "lat": 29.037701, "lon": 48.175632}, {"mmsi": "352003212", "timestamp": "2026-03-03T05:05:00Z", "sog": 0.0, "cog": 48, "lat": 29.037716, "lon": 48.175632}];

async function main() {
  let added = 0;

  for (const d of data) {
    const v = await prisma.vessel.findUnique({ where: { mmsi: d.mmsi } });
    if (v) {
      await prisma.position.create({
        data: {
          vesselId: v.id,
          timestamp: new Date(d.timestamp),
          sog: d.sog,
          cog: d.cog,
          lat: d.lat,
          lon: d.lon
        }
      });
      added++;
    } else {
      console.log('Vessel ' + d.mmsi + ' not found!');
    }
  }
  console.log('Successfully added ' + added + ' historical positions');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
