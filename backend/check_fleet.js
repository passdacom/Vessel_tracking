import { PrismaClient } from '@prisma/client';
import https from 'https';
const prisma = new PrismaClient();
const API_BASE = 'https://api.datalastic.com/api/v0';

function apiCall(endpoint, params) {
  const apiKey = '33ceea11-c650-45ae-a459-a8941203241b';
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
   const vessels = await prisma.vessel.findMany();
   for (const v of vessels) {
     const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
     const res = await apiCall('vessel', params);
     if(res.data) {
        console.log(`${v.alias || v.name}: ${res.data.last_position_UTC}`);
     }
   }
   process.exit(0);
})();
