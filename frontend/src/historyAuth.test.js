import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryRequestBody, validateHistoryPassword } from "./historyAuth.js";

test("validateHistoryPassword requires a non-empty password", () => {
  assert.equal(validateHistoryPassword(""), "히스토리 조회 비밀번호를 입력해주세요.");
  assert.equal(validateHistoryPassword("   "), "히스토리 조회 비밀번호를 입력해주세요.");
  assert.equal(validateHistoryPassword("secret"), "");
});

test("buildHistoryRequestBody includes days and trimmed password", () => {
  assert.deepEqual(buildHistoryRequestBody(14, "  secret  "), { days: 14, password: "secret" });
});
