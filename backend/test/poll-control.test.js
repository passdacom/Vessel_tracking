import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createForceUpdateHandler } from "../src/routes/forceUpdate.js";

test("admin polling disable uses reversible pause rather than terminal stop", () => {
  const adminSource = readFileSync(fileURLToPath(new URL("../src/routes/admin.js", import.meta.url)), "utf8");
  assert.match(adminSource, /poller\.pause\(\)/);
  assert.doesNotMatch(adminSource, /poller\.stop\(\)/);
});

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    chunks: [],
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.ended = true; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    write(chunk) { this.chunks.push(chunk); },
    end() { this.ended = true; },
  };
}

test("manual force-update endpoint returns 409 while a scheduled run is active", async () => {
  let forceCalls = 0;
  const poller = {
    getRunState: () => ({ running: true, source: "scheduled", startedAt: "2026-07-15T00:00:00.000Z" }),
    forceUpdate() { forceCalls += 1; },
  };
  const handler = createForceUpdateHandler({
    prisma: {},
    getPoller: () => poller,
    authenticateCredentialsFn: async () => null,
  });
  const req = { accountRole: "admin", body: {}, app: { locals: { poller } } };
  const res = makeResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "Polling already in progress");
  assert.equal(res.body.run.source, "scheduled");
  assert.equal(forceCalls, 0);
});

test("manual force-update endpoint turns an acquisition race into 409 before streaming", async () => {
  const busy = new Error("busy");
  busy.code = "POLL_BUSY";
  busy.runState = { running: true, source: "startup", startedAt: "2026-07-15T00:00:00.000Z" };
  const poller = {
    getRunState: () => ({ running: false, source: null, startedAt: null }),
    forceUpdate() { throw busy; },
  };
  const handler = createForceUpdateHandler({
    prisma: {},
    getPoller: () => poller,
    authenticateCredentialsFn: async () => null,
  });
  const res = makeResponse();

  await handler({ accountRole: "admin", body: {}, app: { locals: { poller } } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.run.source, "startup");
  assert.deepEqual(res.chunks, []);
  assert.equal(res.headers["transfer-encoding"], undefined);
});

test("manual force-update endpoint returns 503 without starting a stopped poller", async () => {
  let forceCalls = 0;
  const poller = {
    getRunState: () => ({ running: false, stopped: true, source: null, startedAt: null }),
    forceUpdate() { forceCalls += 1; },
  };
  const handler = createForceUpdateHandler({
    prisma: {},
    getPoller: () => poller,
    authenticateCredentialsFn: async () => null,
  });
  const res = makeResponse();

  await handler({ accountRole: "admin", body: {}, app: { locals: { poller } } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "Polling service stopped");
  assert.equal(forceCalls, 0);
  assert.deepEqual(res.chunks, []);
  assert.equal(res.headers["transfer-encoding"], undefined);
});
