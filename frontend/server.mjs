import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDistDir = path.join(__dirname, 'dist');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.geojson', 'application/geo+json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

export function parseRequestPath(rawUrl, host = 'localhost') {
  try {
    const requestUrl = new URL(rawUrl || '/', `http://${host}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    return pathname.includes(String.fromCharCode(0)) ? null : pathname;
  } catch {
    return null;
  }
}

export function selectBackendTransport(backendUrl, transports = { http, https }) {
  if (backendUrl.protocol === 'https:') return transports.https;
  if (backendUrl.protocol === 'http:') return transports.http;
  throw new Error('BACKEND_URL must use http: or https:');
}

function proxyHttp(req, res, { backendUrl, backendTransport, upstreamTimeoutMs }) {
  const headers = { ...req.headers, host: backendUrl.host };
  let timedOut = false;
  const upstream = backendTransport.request(
    {
      protocol: backendUrl.protocol,
      hostname: backendUrl.hostname,
      port: backendUrl.port || undefined,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.setTimeout(upstreamTimeoutMs, () => {
    timedOut = true;
    upstream.destroy(new Error('upstream timeout'));
  });
  upstream.on('error', (error) => {
    console.error('[frontend-prod] API proxy error:', error.code || 'upstream_error');
    if (!res.headersSent) sendError(res, timedOut ? 504 : 502, timedOut ? 'Gateway Timeout' : 'Bad Gateway');
    else res.destroy(error);
  });
  req.once('aborted', () => upstream.destroy());
  res.once('close', () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
}

async function serveStatic(req, res, distDir, decodedPathname) {
  let pathname = decodedPathname;
  if (pathname === '/') pathname = '/index.html';

  const candidate = path.normalize(path.join(distDir, pathname));
  if (!candidate.startsWith(distDir + path.sep) && candidate !== distDir) {
    return sendError(res, 403, 'Forbidden');
  }

  let filePath = candidate;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(distDir, 'index.html');
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return sendError(res, 404, 'Not Found');
    const ext = path.extname(filePath).toLowerCase();
    const cacheControl = filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
    res.writeHead(200, {
      'content-type': contentTypes.get(ext) || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': cacheControl,
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('[frontend-prod] static serve error:', error.message);
    sendError(res, 500, 'Internal Server Error');
  }
}

export function createFrontendServer({
  distDir = defaultDistDir,
  backendUrl: configuredBackendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:3001',
  upstreamTimeoutMs = 15_000,
  wsConnectTimeoutMs = 15_000,
  wsIdleTimeoutMs = 65_000,
  headersTimeoutMs = 10_000,
  requestTimeoutMs = 30_000,
  keepAliveTimeoutMs = 5_000,
} = {}) {
  const backendUrl = configuredBackendUrl instanceof URL
    ? configuredBackendUrl
    : new URL(configuredBackendUrl);
  selectBackendTransport(backendUrl);
  const backendTransport = backendUrl.protocol === 'https:' ? https : http;
  const backendPort = Number.parseInt(
    backendUrl.port || (backendUrl.protocol === 'https:' ? '443' : '80'),
    10,
  );

  const server = http.createServer((req, res) => {
    const pathname = parseRequestPath(req.url, req.headers.host || 'localhost');
    if (pathname === null) return sendError(res, 400, 'Bad Request');
    if (pathname.startsWith('/api/')) {
      return proxyHttp(req, res, { backendUrl, backendTransport, upstreamTimeoutMs });
    }
    return serveStatic(req, res, distDir, pathname);
  });

  server.headersTimeout = headersTimeoutMs;
  server.requestTimeout = requestTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.maxRequestsPerSocket = 1_000;

  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.destroyOpenConnections = () => {
    for (const socket of sockets) socket.destroy();
  };

  server.on('upgrade', (req, socket, head) => {
    const pathname = parseRequestPath(req.url, req.headers.host || 'localhost');
    if (pathname === null || !(pathname === '/ws' || pathname.startsWith('/ws/'))) {
      socket.destroy();
      return;
    }
    const onConnect = () => {
      upstream.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
          Object.entries({ ...req.headers, host: backendUrl.host })
            .map(([key, value]) => `${key}: ${value}`)
            .join('\r\n') +
          '\r\n\r\n',
      );
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    };
    const upstream = backendUrl.protocol === 'https:'
      ? tls.connect({ host: backendUrl.hostname, port: backendPort, servername: backendUrl.hostname }, onConnect)
      : net.connect(backendPort, backendUrl.hostname, onConnect);
    const connectTimer = setTimeout(
      () => upstream.destroy(new Error('upstream WS connect timeout')),
      wsConnectTimeoutMs,
    );
    connectTimer.unref?.();
    upstream.once('data', () => {
      clearTimeout(connectTimer);
      upstream.setTimeout(
        wsIdleTimeoutMs,
        () => upstream.destroy(new Error('upstream WS idle timeout')),
      );
    });
    socket.once('close', () => {
      clearTimeout(connectTimer);
      upstream.destroy();
    });
    upstream.once('close', () => clearTimeout(connectTimer));
    upstream.on('error', (error) => {
      console.error('[frontend-prod] WS proxy error:', error.code || 'upstream_error');
      socket.destroy();
    });
  });

  return server;
}

export function installGracefulShutdown(server, {
  processRef = process,
  graceMs = 10_000,
} = {}) {
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[frontend-prod] ${signal} received; draining connections`);
    server.close();
    const timer = setTimeout(() => server.destroyOpenConnections?.(), graceMs);
    timer.unref?.();
  };
  const onSigterm = () => shutdown('SIGTERM');
  const onSigint = () => shutdown('SIGINT');
  processRef.once('SIGTERM', onSigterm);
  processRef.once('SIGINT', onSigint);
  return () => {
    processRef.removeListener('SIGTERM', onSigterm);
    processRef.removeListener('SIGINT', onSigint);
  };
}

export function startFrontendServer({
  port = Number.parseInt(process.env.PORT || '5173', 10),
  host = process.env.HOST || '0.0.0.0',
  ...serverOptions
} = {}) {
  const server = createFrontendServer(serverOptions);
  installGracefulShutdown(server);
  server.listen(port, host, () => {
    const backendUrl = new URL(serverOptions.backendUrl || process.env.BACKEND_URL || 'http://127.0.0.1:3001');
    console.log(`[frontend-prod] serving ${serverOptions.distDir || defaultDistDir} on ${host}:${port}; backend=${backendUrl.protocol}//${backendUrl.host}`);
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startFrontendServer();
