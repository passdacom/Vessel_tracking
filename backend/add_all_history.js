import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const data = [{"mmsi": "352978156", "timestamp": "2026-03-03T03:49:00Z", "sog": 0.1, "cog": 244, "lat": 26.949133, "lon": 50.045612}, {"mmsi": "352978156", "timestamp": "2026-03-03T03:46:00Z", "sog": 0.5, "cog": 291, "lat": 26.949116, "lon": 50.045723}, {"mmsi": "352978156", "timestamp": "2026-03-03T03:25:00Z", "sog": 0.0, "cog": 335, "lat": 26.949095, "lon": 50.045906}, {"mmsi": "352978156", "timestamp": "2026-03-03T03:04:00Z", "sog": 0.0, "cog": 103, "lat": 26.94907, "lon": 50.045994}, {"mmsi": "352978156", "timestamp": "2026-03-03T02:43:00Z", "sog": 0.2, "cog": 285, "lat": 26.949081, "lon": 50.045799}, {"mmsi": "352978156", "timestamp": "2026-03-03T02:19:00Z", "sog": 0.0, "cog": 90, "lat": 26.949059, "lon": 50.046295}, {"mmsi": "352978156", "timestamp": "2026-03-03T01:55:00Z", "sog": 0.0, "cog": 259, "lat": 26.949125, "lon": 50.046268}, {"mmsi": "352978156", "timestamp": "2026-03-03T01:31:00Z", "sog": 0.0, "cog": 254, "lat": 26.949104, "lon": 50.045815}, {"mmsi": "352978156", "timestamp": "2026-03-03T01:10:00Z", "sog": 0.0, "cog": 78, "lat": 26.949085, "lon": 50.046528}, {"mmsi": "352978156", "timestamp": "2026-03-03T00:49:00Z", "sog": 0.0, "cog": 259, "lat": 26.949051, "lon": 50.046421}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:57:00Z", "sog": 4.1, "cog": 16, "lat": 24.776058, "lon": 56.522026}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:55:00Z", "sog": 4.6, "cog": 9, "lat": 24.773388, "lon": 56.521221}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:53:00Z", "sog": 5.0, "cog": 358, "lat": 24.770649, "lon": 56.520988}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:51:00Z", "sog": 5.6, "cog": 349, "lat": 24.767086, "lon": 56.521233}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:49:00Z", "sog": 6.5, "cog": 349, "lat": 24.763388, "lon": 56.521965}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:46:00Z", "sog": 8.0, "cog": 348, "lat": 24.758717, "lon": 56.522934}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:44:00Z", "sog": 7.5, "cog": 332, "lat": 24.754347, "lon": 56.524319}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:42:00Z", "sog": 8.1, "cog": 339, "lat": 24.750065, "lon": 56.526146}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:40:00Z", "sog": 7.8, "cog": 328, "lat": 24.744949, "lon": 56.528534}, {"mmsi": "441393000", "timestamp": "2026-03-03T03:38:00Z", "sog": 7.0, "cog": 328, "lat": 24.741291, "lon": 56.530907}, {"mmsi": "441708000", "timestamp": "2026-03-03T03:57:00Z", "sog": 0.6, "cog": 55, "lat": 24.916246, "lon": 51.576321}, {"mmsi": "441708000", "timestamp": "2026-03-03T03:51:00Z", "sog": 0.0, "cog": 207, "lat": 24.916206, "lon": 51.576363}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:55:00Z", "sog": 0.3, "cog": 271, "lat": 27.138367, "lon": 49.784901}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:52:00Z", "sog": 0.6, "cog": 274, "lat": 27.138317, "lon": 49.78545}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:49:00Z", "sog": 0.3, "cog": 290, "lat": 27.138216, "lon": 49.786049}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:46:00Z", "sog": 0.5, "cog": 98, "lat": 27.138216, "lon": 49.785851}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:43:00Z", "sog": 0.5, "cog": 96, "lat": 27.13835, "lon": 49.785183}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:40:00Z", "sog": 0.4, "cog": 265, "lat": 27.138334, "lon": 49.785049}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:37:00Z", "sog": 0.6, "cog": 274, "lat": 27.138317, "lon": 49.785683}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:34:00Z", "sog": 0.0, "cog": 113, "lat": 27.138201, "lon": 49.786182}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:31:00Z", "sog": 0.6, "cog": 100, "lat": 27.138233, "lon": 49.785767}, {"mmsi": "440323000", "timestamp": "2026-03-03T03:28:00Z", "sog": 0.4, "cog": 79, "lat": 27.138334, "lon": 49.785099}, {"mmsi": "441046000", "timestamp": "2026-03-03T03:55:00Z", "sog": 0.0, "cog": 275, "lat": 27.081726, "lon": 49.696335}, {"mmsi": "441046000", "timestamp": "2026-03-03T03:31:00Z", "sog": 0.0, "cog": 275, "lat": 27.081734, "lon": 49.696266}, {"mmsi": "441046000", "timestamp": "2026-03-03T03:08:00Z", "sog": 0.0, "cog": 275, "lat": 27.081758, "lon": 49.696312}, {"mmsi": "441046000", "timestamp": "2026-03-03T02:46:00Z", "sog": 0.0, "cog": 275, "lat": 27.081707, "lon": 49.696293}, {"mmsi": "441046000", "timestamp": "2026-03-03T02:25:00Z", "sog": 0.0, "cog": 275, "lat": 27.081703, "lon": 49.696316}, {"mmsi": "441046000", "timestamp": "2026-03-03T02:01:00Z", "sog": 0.0, "cog": 275, "lat": 27.081755, "lon": 49.696335}, {"mmsi": "441046000", "timestamp": "2026-03-03T01:40:00Z", "sog": 0.0, "cog": 275, "lat": 27.081717, "lon": 49.696301}, {"mmsi": "441046000", "timestamp": "2026-03-03T01:16:00Z", "sog": 0.0, "cog": 275, "lat": 27.081686, "lon": 49.69632}, {"mmsi": "441046000", "timestamp": "2026-03-03T00:55:00Z", "sog": 0.0, "cog": 275, "lat": 27.081669, "lon": 49.696346}, {"mmsi": "441046000", "timestamp": "2026-03-03T00:31:00Z", "sog": 0.0, "cog": 275, "lat": 27.081751, "lon": 49.696301}];

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
  console.log('Successfully added ' + added + ' historical positions across 5 vessels');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
