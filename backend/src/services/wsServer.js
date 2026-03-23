import { WebSocketServer } from 'ws';
import { parse } from 'url';

export function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set();

  wss.on('connection', (ws, req) => {
    // 쿼리파라미터 token으로 인증 검증
    const { query } = parse(req.url, true);
    const token = query.token;
    if (!process.env.AUTH_PASSWORD || token !== process.env.AUTH_PASSWORD) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    console.log('[WS] Client connected');
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
      clients.delete(ws);
    });
  });

  return {
    broadcast(data) {
      const msg = JSON.stringify(data);
      for (const client of clients) {
        if (client.readyState === 1) client.send(msg);
      }
    },
  };
}
