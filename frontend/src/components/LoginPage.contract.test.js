import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./LoginPage.jsx", import.meta.url), "utf8");

test("login form selects a remembered company while keeping admin login separate", () => {
  assert.match(source, /JSON\.stringify\(\{\s*account:\s*submittedAccount,\s*password\s*\}\)/);
  assert.match(source, /htmlFor=["']account["'][^>]*>소속 회사</);
  assert.match(source, /<select[\s\S]*id=["']account["'][\s\S]*required/);
  assert.match(source, /COMPANY_ACCOUNTS\.map/);
  assert.match(source, /adminMode\s*\?\s*["']admin["']\s*:\s*account/);
  assert.match(source, /rememberCompany\(undefined,\s*submittedAccount\)/);
  assert.match(source, /관리자 로그인/);
  assert.match(source, /회사 로그인으로 돌아가기/);
  assert.match(source, /htmlFor=["']password["']/);
  assert.match(source, /id=["']password["']/);
  assert.match(source, /autoComplete=["']current-password["']/);
  assert.match(source, /role=["']alert["']/);
  assert.match(source, /aria-live=["']polite["']/);
  assert.doesNotMatch(source, /type=["']text["']/);
  assert.doesNotMatch(source, /onLogin\(password/);
});