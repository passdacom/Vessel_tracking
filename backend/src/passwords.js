import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 64 });
const MAX_PASSWORD_LENGTH = 128;

export function isPasswordHash(value) {
  return typeof value === "string" && value.startsWith("scrypt$");
}

export function validateNewPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    return "비밀번호는 12자 이상이어야 합니다";
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `비밀번호는 ${MAX_PASSWORD_LENGTH}자 이하여야 합니다`;
  }
  return null;
}

export async function hashPassword(password) {
  if (typeof password !== "string") throw new TypeError("password must be a string");
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64url"),
    Buffer.from(digest).toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || !isPasswordHash(encoded)) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6) return false;
  const [, nText, rText, pText, saltText, digestText] = parts;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (N !== PARAMS.N || r !== PARAMS.r || p !== PARAMS.p) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(digestText, "base64url");
    if (salt.length !== 16 || expected.length !== PARAMS.keyLength) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    }));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
