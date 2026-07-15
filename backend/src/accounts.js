/** Account-scoped credential login and session-token authentication. */

import { createHash, timingSafeEqual } from "node:crypto";
import { getSession } from "./sessions.js";
import { hashPassword, isPasswordHash, verifyPassword } from "./passwords.js";

let cachedAccounts = null;
let cacheExpires = 0;
const CACHE_TTL = 30000;
const DUMMY_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

async function loadAccounts(prisma) {
  if (cachedAccounts && Date.now() < cacheExpires) return cachedAccounts;
  cachedAccounts = await prisma.account.findMany({
    select: { name: true, role: true },
  });
  cacheExpires = Date.now() + CACHE_TTL;
  return cachedAccounts;
}

function legacyPasswordsMatch(supplied, stored) {
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  const storedDigest = createHash("sha256").update(stored).digest();
  return timingSafeEqual(suppliedDigest, storedDigest);
}

export function clearAccountCache() {
  cachedAccounts = null;
  cacheExpires = 0;
}

/** Authorization bearer tokens are sessions only; passwords are never bearer principals. */
export async function authenticate(_prisma, token) {
  if (!token) return null;
  return getSession(token);
}

/** Account+password login, including one-time account-specific legacy plaintext upgrade. */
export async function authenticateCredentials(prisma, accountName, password) {
  if (typeof accountName !== "string" || typeof password !== "string" || !accountName || !password) {
    return null;
  }

  const account = await prisma.account.findUnique({ where: { name: accountName } });
  if (!account) {
    await verifyPassword(password, DUMMY_HASH);
    return null;
  }

  const valid = isPasswordHash(account.password)
    ? await verifyPassword(password, account.password)
    : legacyPasswordsMatch(password, account.password);
  if (!valid) return null;

  if (!isPasswordHash(account.password)) {
    const upgradedPassword = await hashPassword(password);
    await prisma.account.update({
      where: { name: account.name },
      data: { password: upgradedPassword },
    });
    clearAccountCache();
  }

  return { name: account.name, role: account.role };
}

/** Get all non-admin account names. */
export async function getAccountNames(prisma) {
  const accounts = await loadAccounts(prisma);
  return accounts.filter((account) => account.role !== "admin").map((account) => account.name);
}