import { fetchAllVesselsOnce } from './src/services/datalasticPoller.js';

(async () => {
    try {
        await fetchAllVesselsOnce();
        console.log('Polled successfully');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
})();
