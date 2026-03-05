import https from 'https';

function apiCall(endpoint, params) {
  const apiKey = '33ceea11-c650-45ae-a459-a8941203241b';
  const qs = new URLSearchParams({ 'api-key': apiKey, ...params }).toString();
  const url = `https://api.datalastic.com/api/v0/${endpoint}?${qs}`;
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });
}

(async () => {
   // 혹시 YC AZALEA의 다른 알려진 MMSI가 있는지 MarineTraffic에 노출되었던 440323000 외에 441046000, 352978156, 352003212, 441708000, 441393000 중 하나인지 확인
   const list = ['440323000','441046000','352978156','352003212','441708000','441393000'];
   for(const mmsi of list) {
       const res = await apiCall('vessel_info', { mmsi });
       if(res.data) {
           console.log(mmsi, res.data.name);
       }
   }
   process.exit(0);
})();
