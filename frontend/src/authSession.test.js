import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_STORAGE_KEYS,
  clearAuthStorage,
  createApiFetch,
  getStoredAuthToken,
} from "./authSession.js";

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    has(key) {
      return data.has(key);
    },
    value(key) {
      return data.get(key);
    },
  };
}

test("clearAuthStorage removes all auth/session keys but leaves UI preferences", () => {
  const storage = makeStorage({
    vessel_token: "stale-token",
    vessel_token_expires: "9999999999999",
    vessel_auth: "legacy-password",
    vessel_auth_expires: "9999999999999",
    vessel_account: "acct",
    vessel_role: "admin",
    vessel_show_labels: "true",
  });

  clearAuthStorage(storage);

  for (const key of AUTH_STORAGE_KEYS) {
    assert.equal(storage.has(key), false, `${key} should be removed`);
  }
  assert.equal(storage.value("vessel_show_labels"), "true");
});

test("createApiFetch clears stale token and calls onUnauthorized when API returns 401", async () => {
  const storage = makeStorage({
    vessel_token: "stale-token",
    vessel_token_expires: "9999999999999",
    vessel_account: "acct",
    vessel_role: "user",
  });
  let logoutCount = 0;
  let capturedHeaders;
  const fetchImpl = async (_url, options) => {
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  };

  const apiFetch = createApiFetch({ storage, fetchImpl, onUnauthorized: () => { logoutCount += 1; } });
  const response = await apiFetch("/vessels");

  assert.equal(response.status, 401);
  assert.equal(capturedHeaders.Authorization, "Bearer stale-token");
  for (const key of AUTH_STORAGE_KEYS) {
    assert.equal(storage.has(key), false, `${key} should be removed`);
  }
  assert.equal(logoutCount, 1);
});

test("getStoredAuthToken prefers session token over legacy password", () => {
  const storage = makeStorage({ vessel_token: "token", vessel_auth: "legacy" });
  assert.equal(getStoredAuthToken(storage), "token");
});
