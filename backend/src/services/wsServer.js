import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { authenticate } from '../accounts.js';

export function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Map(); // ws -> { account, role }

  wss.on('connection', (ws, req) => {
    const { query } = parse(req.url, true);
    const token = query.token;
    const account = token ? authenticate(token) : null;
    if (!account) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    console.log(`[WS] Client connected (${account.name})`);
    clients.set(ws, account);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected (${account.name})`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
      clients.delete(ws);
    });
  });

  return {
    /** Broadcast to all connected clients */
    broadcast(data) {
      const msg = JSON.stringify(data);
      for (const [client] of clients) {
        if (client.readyState === 1) client.send(msg);
      }
    },
    /** Broadcast only to clients of a specific account (or admin) */
    broadcastToAccount(data, accountName) {
      const msg = JSON.stringify(data);
      for (const [client, acct] of clients) {
        if (client.readyState === 1 && (acct.name === accountName || acct.role === 'admin')) {
          client.send(msg);
        }
      }
    },
  };
}
