import { WebSocketServer } from 'ws';
import { URL } from 'url';

export function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    if (process.env.AUTH_PASSWORD) {
      try {
        const url = new URL(req.url, 'http://localhost');
        const token = url.searchParams.get('token');
        if (token !== process.env.AUTH_PASSWORD) {
          ws.close(4001, 'Unauthorized');
          return;
        }
      } catch {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }
    console.log('[WS] Client connected');
    ws.on('close', () => console.log('[WS] Client disconnected'));
    ws.on('error', (err) => console.error('[WS] Error:', err.message));
  });

  function broadcast(data) {
    const msg = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(msg);
      }
    }
  }

  return { wss, broadcast };
}
