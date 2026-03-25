/**
 * Multi-account authentication via database
 * Falls back to ACCOUNTS env var for initial seeding
 */

let cachedAccounts = null;
let cacheExpires = 0;
const CACHE_TTL = 30000; // 30 seconds

/** Load accounts from DB (with short cache) */
async function loadAccounts(prisma) {
  if (cachedAccounts && Date.now() < cacheExpires) return cachedAccounts;

  const rows = await prisma.account.findMany();
  cachedAccounts = new Map();
  for (const row of rows) {
    cachedAccounts.set(row.password, { name: row.name, role: row.role });
  }
  cacheExpires = Date.now() + CACHE_TTL;
  return cachedAccounts;
}

/** Clear cache (call after password change) */
export function clearAccountCache() {
  cachedAccounts = null;
  cacheExpires = 0;
}

/** Authenticate password -> { name, role } or null */
export async function authenticate(prisma, password) {
  const accounts = await loadAccounts(prisma);
  return accounts.get(password) || null;
}

/** Get all account names (non-admin) */
export async function getAccountNames(prisma) {
  const accounts = await loadAccounts(prisma);
  return [...accounts.values()].filter(a => a.role !== "admin").map(a => a.name);
}
