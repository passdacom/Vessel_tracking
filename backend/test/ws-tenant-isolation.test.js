import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import WebSocket from "ws";
import { createSession, invalidateAccount } from "../src/sessions.js";
import { createWsServer } from "../src/services/wsServer.js";

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function nextClose(ws, timeoutMs = 1_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("close timeout"));
    }, timeoutMs);
    const onClose = (code, reason) => {
      cleanup();
      resolve({ code, reason: reason.toString() });
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("close", onClose);
    };
    ws.once("close", onClose);
  });
}

function nextMessage(ws, timeoutMs = 200) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("message timeout"));
    }, timeoutMs);
    const onMessage = (data) => {
      cleanup();
      resolve(JSON.parse(data.toString()));
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
    };
    ws.once("message", onMessage);
  });
}

async function closeSocket(ws) {
  if (ws.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    ws.once("close", resolve);
    ws.close();
  });
}

test("tenant-owned position broadcasts never reach another authenticated tenant", async () => {
  const httpServer = createServer();
  const wsServer = createWsServer(httpServer, {});
  const tokenA = createSession("tenant-a", "user");
  const tokenB = createSession("tenant-b", "user");
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const clientA = new WebSocket(`ws://127.0.0.1:${port}/ws`, [tokenA, "vessel-auth"]);
  const clientB = new WebSocket(`ws://127.0.0.1:${port}/ws`, ["vessel-auth", tokenB]);

  try {
    await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);
    assert.equal(clientA.protocol, "vessel-auth");
    assert.equal(clientB.protocol, "vessel-auth");

    const receivedByA = nextMessage(clientA);
    const receivedByB = nextMessage(clientB);
    wsServer.broadcast({
      type: "position",
      data: { account: "tenant-a", vesselId: 11, mmsi: "123456789" },
    });

    assert.equal((await receivedByA).data.vesselId, 11);
    await assert.rejects(receivedByB, /message timeout/);

    const ownA = nextMessage(clientA);
    wsServer.broadcastToAccount({
      type: "position",
      data: { account: "tenant-a", vesselId: 11, mmsi: "987654321" },
    }, "tenant-a");
    assert.equal((await ownA).data.vesselId, 11);

    const ownB = nextMessage(clientB);
    wsServer.broadcastToAccount({
      type: "position",
      data: { account: "tenant-b", vesselId: 22, mmsi: "987654321" },
    }, "tenant-b");
    assert.equal((await ownB).data.vesselId, 22);

    const missingAccountA = nextMessage(clientA);
    const missingAccountB = nextMessage(clientB);
    wsServer.broadcast({
      type: "position",
      data: { vesselId: 99, mmsi: "111111111" },
    });
    await Promise.all([
      assert.rejects(missingAccountA, /message timeout/),
      assert.rejects(missingAccountB, /message timeout/),
    ]);
  } finally {
    await Promise.all([closeSocket(clientA), closeSocket(clientB)]);
    invalidateAccount("tenant-a");
    invalidateAccount("tenant-b");
    await wsServer.close();
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("query token and invalid protocol token both close unauthorized", async () => {
  const httpServer = createServer();
  const wsServer = createWsServer(httpServer, {});
  const token = createSession("tenant-fallback", "user");
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const fallback = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const unauthorized = new WebSocket(`ws://127.0.0.1:${port}/ws`, ["vessel-auth", "invalid-session"]);

  try {
    const fallbackClosed = nextClose(fallback);
    const protocolClosed = nextClose(unauthorized);
    await Promise.all([waitForOpen(fallback), waitForOpen(unauthorized)]);
    assert.deepEqual(await fallbackClosed, { code: 1008, reason: "Unauthorized" });
    assert.deepEqual(await protocolClosed, { code: 1008, reason: "Unauthorized" });
  } finally {
    await Promise.all([closeSocket(fallback), closeSocket(unauthorized)]);
    invalidateAccount("tenant-fallback");
    await wsServer.close();
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("an authenticated WebSocket closes when its session TTL expires", async () => {
  const httpServer = createServer();
  const wsServer = createWsServer(httpServer, {}, { heartbeatIntervalMs: 5 });
  const token = createSession("tenant-expiring", "user", { ttlMs: 100 });
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`, ["vessel-auth", token]);

  try {
    const closed = nextClose(client);
    await waitForOpen(client);
    assert.equal(client.protocol, "vessel-auth");
    assert.deepEqual(await closed, { code: 1008, reason: "Session expired" });
  } finally {
    await closeSocket(client);
    invalidateAccount("tenant-expiring");
    await wsServer.close();
    await new Promise((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
  }
});
