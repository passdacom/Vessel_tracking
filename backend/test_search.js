import https from 'https';

function apiCall(endpoint, params) {
  const apiKey = '33ceea11-c650-45ae-a459-a8941203241b'; // from .env
  const qs = new URLSearchParams({ 'api-key': apiKey, ...params }).toString();
  const url = `https://api.datalastic.com/api/v0/${endpoint}?${qs}`;
  return new Promise(resolve => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    });
  });
}

(async () => {
   console.log('Searching for YC AZALEA:');
   const res1 = await apiCall('vessel_info', { name: 'YC AZALEA' });
   console.log(JSON.stringify(res1, null, 2));
   
   console.log('Searching for FORTITUDE:');
   const res2 = await apiCall('vessel_info', { name: 'FORTITUDE' });
   console.log(JSON.stringify(res2, null, 2));
})();
