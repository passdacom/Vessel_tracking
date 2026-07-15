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
   // 이전 MMSI 440323000 으로 API 콜 해보기 (프라임이거나 옛 데이터)
   const res = await apiCall('vessel', { mmsi: '440323000' });
   console.log('--- Calling API with OLD MMSI 440323000 ---');
   console.log(JSON.stringify(res.data, null, 2));

   // YC AZALEA 의 새 MMSI는 538007605 입니다. (FORTITUDE와 동일 선박 여부 확인용)
   process.exit(0);
})();
