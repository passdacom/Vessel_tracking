import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { authenticate } from '../accounts.js';

const AUTH_PROTOCOL = 'vessel-auth';
const TENANT_EVENT_TYPES = new Set(["position", "vessel_updated", "zone_event"]);

export function selectWsProtocol(protocols) {
  return protocols.has(AUTH_PROTOCOL) ? AUTH_PROTOCOL : false;
}

export function getWsProtocolToken(req) {
  const offered = String(req.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!offered.includes(AUTH_PROTOCOL)) return null;
  const tokens = offered.filter((value) => value !== AUTH_PROTOCOL);
  return tokens.length === 1 ? tokens[0] : null;
}

export function createWsServer(httpServer, prisma) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    handleProtocols: selectWsProtocol,
  });
  const clients = new Map();

  const heartbeatInterval = setInterval(() => {
    for (const [client] of clients) {
      if (client.readyState === 1) {
        client.ping();
      }
    }
  }, 25000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', async (ws, req) => {
    const connectedAt = Date.now();
    const { query } = parse(req.url, true);
    const token = getWsProtocolToken(req) || query.token;
    const account = token ? await authenticate(prisma, token) : null;
    if (!account) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    console.log(`[WS] Client connected (${account.name})`);
    clients.set(ws, account);

    ws.on('close', (code, reason) => {
      clients.delete(ws);
      const durationMs = Date.now() - connectedAt;
      console.log(
        `[WS] Client disconnected (${account.name}) code=${code} reason=${reason?.toString() || ''} durationMs=${durationMs}`
      );
    });
    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
      clients.delete(ws);
    });
  });

  return {
    broadcast(data) {
      if (TENANT_EVENT_TYPES.has(data?.type)) {
        const accountName = data?.data?.account;
        if (!accountName) return false;
        this.broadcastToAccount(data, accountName);
        return true;
      }
      const msg = JSON.stringify(data);
      for (const [client] of clients) {
        if (client.readyState === 1) client.send(msg);
      }
      return true;
    },
    broadcastToAccount(data, accountName) {
      const msg = JSON.stringify(data);
      for (const [client, acct] of clients) {
        if (client.readyState === 1 && (acct.name === accountName || acct.role === 'admin')) {
          client.send(msg);
        }
      }
    },
    disconnectAccount(accountName) {
      for (const [client, account] of clients) {
        if (account.name === accountName) {
          clients.delete(client);
          client.close(1008, 'Session revoked');
        }
      }
    },
    close({ graceMs = 1_000 } = {}) {
      clearInterval(heartbeatInterval);
      for (const [client] of clients) {
        if (client.readyState < 2) client.close(1001, 'Server shutting down');
      }
      return new Promise((resolve) => {
        let settled = false;
        let forceTimer;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(forceTimer);
          resolve();
        };
        forceTimer = setTimeout(() => {
          for (const [client] of clients) client.terminate();
        }, graceMs);
        forceTimer.unref?.();
        wss.close(finish);
      });
    },
    terminateClients() {
      for (const [client] of clients) client.terminate();
    },
  };
}
