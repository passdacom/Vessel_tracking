import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createGracefulShutdown } from "../src/shutdown.js";
import { installRuntimeHandlers } from "../src/runtime.js";

test("startup awaits asynchronous poller initialization before continuing", () => {
  const indexSource = readFileSync(fileURLToPath(new URL("../src/index.js", import.meta.url)), "utf8");
  assert.match(indexSource, /await datalasticPoller\.start\(\);/);
});

test("graceful shutdown stops intake, drains active work, disconnects Prisma, then exits", async () => {
  const events = [];
  const shutdown = createGracefulShutdown({
    timeoutMs: 100,
    httpServer: {
      close(callback) { events.push("http-close"); setTimeout(callback, 5); },
      closeAllConnections() { events.push("http-force-close"); },
    },
    wsServer: {
      async close() { events.push("ws-close"); },
      terminateClients() { events.push("ws-terminate"); },
    },
    poller: {
      stop() { events.push("poll-stop"); },
      async waitForIdle() {
        events.push("poll-wait");
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push("poll-idle");
      },
    },
    prisma: { async $disconnect() { events.push("prisma-disconnect"); } },
    exitFn(code) { events.push(`exit-${code}`); },
    log: { info() {}, error() {} },
  });

  await shutdown("SIGTERM");

  assert.equal(events[0], "poll-stop");
  assert.ok(events.indexOf("prisma-disconnect") > events.indexOf("poll-idle"));
  assert.equal(events.at(-1), "exit-0");
  assert.equal(events.includes("http-force-close"), false);
  assert.equal(events.includes("ws-terminate"), false);
});

test("graceful shutdown timeout force-closes connections but still disconnects Prisma", async () => {
  const events = [];
  const never = new Promise(() => {});
  const shutdown = createGracefulShutdown({
    timeoutMs: 10,
    httpServer: {
      close() { events.push("http-close"); },
      closeAllConnections() { events.push("http-force-close"); },
    },
    wsServer: {
      close() { events.push("ws-close"); return never; },
      terminateClients() { events.push("ws-terminate"); },
    },
    poller: {
      stop() { events.push("poll-stop"); },
      waitForIdle() { events.push("poll-wait"); return never; },
    },
    prisma: { async $disconnect() { events.push("prisma-disconnect"); } },
    exitFn(code) { events.push(`exit-${code}`); },
    log: { info() {}, error() {} },
  });

  await shutdown("SIGTERM");

  assert.ok(events.includes("http-force-close"));
  assert.ok(events.includes("ws-terminate"));
  assert.ok(events.indexOf("prisma-disconnect") > events.indexOf("ws-terminate"));
  assert.equal(events.at(-1), "exit-1");
});

test("a fatal runtime error upgrades an in-progress graceful shutdown to a non-zero exit", async () => {
  const events = [];
  let releaseDrain;
  const drain = new Promise((resolve) => { releaseDrain = resolve; });
  const shutdown = createGracefulShutdown({
    timeoutMs: 100,
    httpServer: { close(callback) { void drain.then(() => callback()); } },
    wsServer: { async close() {}, terminateClients() {} },
    poller: { stop() { events.push("poll-stop"); }, async waitForIdle() {} },
    prisma: { async $disconnect() { events.push("prisma-disconnect"); } },
    exitFn(code) { events.push(`exit-${code}`); },
    log: { info() {}, error() {} },
  });

  const signalShutdown = shutdown("SIGTERM", { exitCode: 0 });
  const fatalShutdown = shutdown("uncaughtException", { exitCode: 1 });
  releaseDrain();
  await Promise.all([signalShutdown, fatalShutdown]);

  assert.equal(events.filter((event) => event === "poll-stop").length, 1);
  assert.equal(events.at(-1), "exit-1");
});

test("runtime handlers route signals and fatal errors through shutdown", async () => {
  const processRef = new EventEmitter();
  const calls = [];
  installRuntimeHandlers({
    processRef,
    shutdown: async (reason, options) => { calls.push([reason, options]); },
    log: { error() {} },
  });

  processRef.emit("SIGINT");
  processRef.emit("uncaughtException", new Error("boom"));
  processRef.emit("unhandledRejection", new Error("rejected"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, [
    ["SIGINT", { exitCode: 0 }],
    ["uncaughtException", { exitCode: 1 }],
    ["unhandledRejection", { exitCode: 1 }],
  ]);
});
