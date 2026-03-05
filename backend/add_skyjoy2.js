import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

(async () => {
   // 1. Search DB first
   let existing = await prisma.vessel.findFirst({ where: { alias: 'SKY JOY' } });
   if (existing) {
     console.log('SKY JOY already in DB', existing);
     process.exit(0);
   }

   const inserted = await prisma.vessel.create({
     data: {
       mmsi: '441327000',
       name: 'SKY JOY',
       alias: 'SKY JOY',
       color: '#a855f7', // purple-ish color
       imo: '9366938',
       homePort: null,
     }
   });
   
   console.log('Inserted SKY JOY into DB:', inserted);
   process.exit(0);

})();
