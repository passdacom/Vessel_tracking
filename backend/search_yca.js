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
   // YC AZALEA (or YC) 이름으로 검색해보기
   const res = await apiCall('vessel_info', { name: 'YC AZALEA' });
   console.log('--- Search by Name: YC AZALEA ---');
   console.log(JSON.stringify(res.data, null, 2));

   process.exit(0);
})();
