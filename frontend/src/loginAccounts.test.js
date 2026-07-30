import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_ACCOUNTS,
  getRememberedCompany,
  rememberCompany,
} from "./loginAccounts.js";

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    snapshot() { return Object.fromEntries(values); },
  };
}

test("company login choices expose only the three non-admin production accounts", () => {
  assert.deepEqual(COMPANY_ACCOUNTS, [
    { value: "kb", label: "KB" },
    { value: "kdgc", label: "KDGC" },
    { value: "kre", label: "KRE" },
  ]);
});

test("the last valid company is remembered but admin and unknown accounts are not", () => {
  const storage = makeStorage();
  rememberCompany(storage, "kdgc");
  assert.equal(getRememberedCompany(storage), "kdgc");

  rememberCompany(storage, "admin");
  assert.equal(getRememberedCompany(storage), "kdgc");

  const unknown = makeStorage({ vessel_last_account: "unknown" });
  assert.equal(getRememberedCompany(unknown), "");

  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(getRememberedCompany(blocked), "");
  assert.doesNotThrow(() => rememberCompany(blocked, "kb"));
});
