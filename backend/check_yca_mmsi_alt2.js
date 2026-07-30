import https from 'https';

function apiCall(endpoint, params) {
  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) throw new Error('DATALASTIC_API_KEY is required');
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
   // 혹시나 YC AZALEA가 신규 MMSI를 발급받았을 수 있으니 Datalastic의 최근 IMO 리스트나 name 검색 등으로 YC 계열 조회
   const res = await apiCall('vessel_info', { name: 'YC ' });
   if(res.data) {
       console.log(JSON.stringify(res.data, null, 2));
   } else {
       console.log('Not found with YC ');
   }
   process.exit(0);
})();
