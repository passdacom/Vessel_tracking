import { WebSocketServer } from 'ws';
import { getSessionDetails } from '../sessions.js';

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

export function createWsServer(httpServer, _prisma, { heartbeatIntervalMs = 25_000 } = {}) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    handleProtocols: selectWsProtocol,
  });
  const clients = new Map();
  const heartbeatMs = Math.max(1, Number(heartbeatIntervalMs) || 25_000);

  const heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const [client, session] of clients) {
      if (now >= session.expiresAt) {
        clients.delete(client);
        if (client.readyState < 2) client.close(1008, 'Session expired');
        continue;
      }
      if (client.readyState === 1) {
        client.ping();
      }
    }
  }, heartbeatMs);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', async (ws, req) => {
    const connectedAt = Date.now();
    const token = getWsProtocolToken(req);
    const session = token ? getSessionDetails(token) : null;
    if (!session) {
      ws.close(1008, 'Unauthorized');
      return;
    }
    console.log(`[WS] Client connected (${session.name})`);
    clients.set(ws, session);

    ws.on('close', (code, reason) => {
      clients.delete(ws);
      const durationMs = Date.now() - connectedAt;
      console.log(
        `[WS] Client disconnected (${session.name}) code=${code} reason=${reason?.toString() || ''} durationMs=${durationMs}`
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
