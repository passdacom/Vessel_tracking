import { WebSocketServer } from 'ws';

export function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set();

  wss.on('connection', (ws) => {
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
