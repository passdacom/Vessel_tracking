import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import {
  isTrustedLoopbackProxy,
  resolveBackendHost,
  trustImmediateLoopbackProxy,
} from "../src/network.js";

async function resolveExpressRequestIp(remoteAddress, forwardedFor) {
  const app = express();
  app.set("trust proxy", trustImmediateLoopbackProxy);
  app.use((req, _res, next) => {
    Object.defineProperty(req.socket, "remoteAddress", {
      configurable: true,
      value: remoteAddress,
    });
    next();
  });
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/ip`, {
      headers: { "x-forwarded-for": forwardedFor },
    });
    return (await response.json()).ip;
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("only loopback reverse proxies are trusted for forwarded client IPs", () => {
  assert.equal(isTrustedLoopbackProxy("127.0.0.1"), true);
  assert.equal(isTrustedLoopbackProxy("::1"), true);
  assert.equal(isTrustedLoopbackProxy("::ffff:127.0.0.1"), true);
  assert.equal(isTrustedLoopbackProxy("203.0.113.9"), false);
  assert.equal(isTrustedLoopbackProxy(undefined), false);
});

test("backend bind host defaults to loopback and permits an explicit override", () => {
  assert.equal(resolveBackendHost({}), "127.0.0.1");
  assert.equal(resolveBackendHost({ HOST: "0.0.0.0" }), "0.0.0.0");
});

test("Express trusts forwarded IP only when the immediate peer is loopback", async () => {
  assert.equal(
    await resolveExpressRequestIp("127.0.0.1", "203.0.113.9"),
    "203.0.113.9",
  );
  assert.equal(
    await resolveExpressRequestIp("198.51.100.8", "203.0.113.9"),
    "198.51.100.8",
  );
});
