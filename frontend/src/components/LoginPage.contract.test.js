import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./LoginPage.jsx", import.meta.url), "utf8");

test("login form submits account and password with accessible browser hints", () => {
  assert.match(source, /JSON\.stringify\(\{\s*account,\s*password\s*\}\)/);
  assert.match(source, /htmlFor=["']account["']/);
  assert.match(source, /id=["']account["']/);
  assert.match(source, /autoComplete=["']username["']/);
  assert.match(source, /htmlFor=["']password["']/);
  assert.match(source, /id=["']password["']/);
  assert.match(source, /autoComplete=["']current-password["']/);
  assert.match(source, /role=["']alert["']/);
  assert.match(source, /aria-live=["']polite["']/);
  assert.doesNotMatch(source, /onLogin\(password/);
});