import test from "node:test";
import assert from "node:assert/strict";
import { isUnauthorizedCloseEvent, shouldReconnectWebSocket } from "./wsReconnect.js";

test("isUnauthorizedCloseEvent detects policy-violation auth failures", () => {
  assert.equal(isUnauthorizedCloseEvent({ code: 1008, reason: "Unauthorized" }), true);
  assert.equal(isUnauthorizedCloseEvent({ code: 4001, reason: "auth token expired" }), true);
  assert.equal(isUnauthorizedCloseEvent({ code: 1006, reason: "invalid token" }), true);
});

test("shouldReconnectWebSocket suppresses reconnect for unauthorized closes", () => {
  assert.equal(shouldReconnectWebSocket({ code: 1008, reason: "Unauthorized" }), false);
  assert.equal(shouldReconnectWebSocket({ code: 1006, reason: "network lost" }), true);
  assert.equal(shouldReconnectWebSocket({ code: 1000, reason: "normal" }), true);
});

test("shouldReconnectWebSocket suppresses reconnect during intentional hook cleanup", () => {
  assert.equal(shouldReconnectWebSocket({ code: 1000, reason: "normal" }, { intentionalClose: true }), false);
});

test("shouldReconnectWebSocket suppresses reconnect for stale sockets", () => {
  assert.equal(shouldReconnectWebSocket({ code: 1006, reason: "network lost" }, { isCurrentSocket: false }), false);
});
