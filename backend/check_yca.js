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
   const yca = await prisma.vessel.findFirst({ where: { alias: 'YC AZALEA' } });
   console.log('DB YC AZALEA:', yca);
   
   console.log('--- Calling API with IMO:', yca.imo, '---');
   const res = await apiCall('vessel', { imo: yca.imo });
   console.log(JSON.stringify(res, null, 2));

   console.log('--- Calling API with MMSI:', yca.mmsi, '---');
   const res2 = await apiCall('vessel', { mmsi: yca.mmsi });
   console.log(JSON.stringify(res2, null, 2));

   process.exit(0);
})();
