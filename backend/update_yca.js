import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.vessel.updateMany({
    where: { mmsi: "440323000" },
    data: {
      name: "YC AZALEA",
      alias: "YC AZALEA",
      imo: "9272682",
      callsign: "D7IQ",
      countryIso: "KR",
      countryName: "South Korea",
      vesselType: "Tanker",
      typeSpecific: "Oil or Chemical Tanker",
      grossTonnage: 12105,
      deadweight: 19997,
      yearBuilt: "2004",
      infoFetched: true
    }
  });
  console.log("Updated:", result.count);
  const vessel = await prisma.vessel.findUnique({ where: { mmsi: "440323000" } });
  console.log("Current:", vessel);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
