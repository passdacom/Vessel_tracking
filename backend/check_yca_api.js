import https from 'https';

function apiCall(endpoint, params) {
  const apiKey = '33ceea11-c650-45ae-a459-a8941203241b';
  const qs = new URLSearchParams({ 'api-key': apiKey, ...params }).toString();
  const url = `https://api.datalastic.com/api/v0/${endpoint}?${qs}`;
  return new Promise(resolve => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
   console.log('--- Query by IMO 9272682 (Expected YC AZALEA) ---');
   const res1 = await apiCall('vessel', { imo: '9272682' });
   console.log(JSON.stringify(res1, null, 2));
   
   console.log('--- Query by MMSI 440323000 ---');
   const res2 = await apiCall('vessel', { mmsi: '440323000' });
   console.log(JSON.stringify(res2, null, 2));

   console.log('--- Query by MMSI 538007605 ---');
   const res3 = await apiCall('vessel', { mmsi: '538007605' });
   console.log(JSON.stringify(res3, null, 2));
})();
