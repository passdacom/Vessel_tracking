import test from "node:test";
import assert from "node:assert/strict";
import { createAuthenticatedWebSocket } from "./wsAuth.js";

test("browser websocket sends the session as a protocol and keeps it out of the URL", () => {
  const calls = [];
  class FakeWebSocket {
    constructor(url, protocols) {
      calls.push({ url, protocols });
    }
  }

  const token = "opaque-session-token";
  createAuthenticatedWebSocket("wss://vessel.example/ws", token, FakeWebSocket);

  assert.deepEqual(calls, [{
    url: "wss://vessel.example/ws",
    protocols: ["vessel-auth", token],
  }]);
  assert.doesNotMatch(calls[0].url, /opaque-session-token|token=/);
});
