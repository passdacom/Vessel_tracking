import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
   const yca = await prisma.vessel.findFirst({ where: { alias: 'YC AZALEA' } });
   console.log('DB YC AZALEA ID:', yca.id);
   
   const pos = await prisma.position.findMany({ 
       where: { vesselId: yca.id },
       orderBy: { timestamp: 'desc' },
       take: 5
   });
   console.log('Recent 5 positions:');
   pos.forEach(p => {
       console.log(`  - ${p.timestamp.toISOString()} | lat: ${p.lat}, lon: ${p.lon} | SOG: ${p.sog}`);
   });
   process.exit(0);
})();
