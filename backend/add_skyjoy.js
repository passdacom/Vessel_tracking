import { PrismaClient } from '@prisma/client';
import https from 'https';
const prisma = new PrismaClient();
const API_BASE = 'https://api.datalastic.com/api/v0';

function apiCall(endpoint, params) {
  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) throw new Error('DATALASTIC_API_KEY is required');
  const qs = new URLSearchParams({ 'api-key': apiKey, ...params }).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });
}

(async () => {
   // 1. Search DB first
   let existing = await prisma.vessel.findFirst({ where: { alias: 'SKY JOY' } });
   if (existing) {
     console.log('SKY JOY already in DB', existing);
     process.exit(0);
   }

   // 2. Search Datalastic
   console.log('Searching SKY JOY from Datalastic...');
   const res = await apiCall('vessel_info', { name: 'SKY JOY' });
   
   if (!res.data) {
     console.log('SKY JOY not found in Datalastic API');
     process.exit(1);
   }
   
   // It returns an array if using name or maybe just a single object if exact match?
   // Datalastic vessel_info by name usually returns a single best match or array. Let's inspect.
   console.log('Match found:', res.data);
   
   const vesselData = Array.isArray(res.data) ? res.data[0] : res.data;
   if (!vesselData) {
     console.log('No data object');
     process.exit(1);
   }

   // 3. Insert into DB
   const mmsi = vesselData.mmsi;
   if (!mmsi) {
     console.log('No MMSI found for SKY JOY');
     process.exit(1);
   }

   const inserted = await prisma.vessel.create({
     data: {
       mmsi: String(mmsi),
       name: vesselData.name || 'SKY JOY',
       alias: 'SKY JOY',
       color: '#a855f7', // purple-ish color
       imo: vesselData.imo ? String(vesselData.imo) : null,
       homePort: null,
     }
   });
   
   console.log('Inserted SKY JOY into DB:', inserted);
   process.exit(0);

})();
