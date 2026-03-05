import { PrismaClient } from "@prisma/client";
import https from "https";

const prisma = new PrismaClient();

function apiCall(endpoint, params) {
  const apiKey = process.env.DATALASTIC_API_KEY;
  const qs = new URLSearchParams({ "api-key": apiKey, ...params }).toString();
  const url = `https://api.datalastic.com/api/v0/${endpoint}?${qs}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on("error", () => resolve(null));
  });
}

async function main() {
  const vessel = await prisma.vessel.findUnique({ where: { mmsi: "440323000" } });
  console.log("Vessel:", vessel.name, vessel.mmsi, "IMO:", vessel.imo);

  // Try by MMSI first
  let res = await apiCall("vessel", { mmsi: "440323000" });
  console.log("By MMSI response:", JSON.stringify(res?.data).slice(0, 200));

  if (res?.data?.lat) {
    const d = res.data;
    const pos = await prisma.position.create({
      data: {
        vesselId: vessel.id,
        lat: parseFloat(d.lat),
        lon: parseFloat(d.lon),
        cog: parseFloat(d.course) || null,
        sog: parseFloat(d.speed) || null,
        heading: d.heading != null && d.heading !== 511 ? parseInt(d.heading) : null,
        navStatus: d.navigation_status || null,
        destination: d.destination || null,
        eta: d.eta_UTC ? new Date(d.eta_UTC) : null,
        timestamp: d.last_position_epoch ? new Date(d.last_position_epoch * 1000) : new Date(),
      }
    });
    console.log("✅ Position saved:", pos.lat, pos.lon, "Dest:", pos.destination);
  } else {
    console.log("⚠ No position data from Datalastic for this MMSI");
    console.log("Full response:", JSON.stringify(res));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
