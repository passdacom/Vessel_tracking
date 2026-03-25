/**
 * Multi-account configuration
 *
 * Env var ACCOUNTS format: "accountName:password,accountName2:password2,..."
 * Example: "kb:kb1234,kdgc:kdgc1234,admin:aa880715"
 */

let accountMap = null; // password -> { name, role }

function loadAccounts() {
  if (accountMap) return accountMap;
  accountMap = new Map();

  const raw = process.env.ACCOUNTS;
  if (!raw) {
    console.error("[ACCOUNTS] ACCOUNTS env var not set!");
    return accountMap;
  }

  for (const entry of raw.split(",")) {
    const [name, password] = entry.trim().split(":");
    if (!name || !password) continue;
    const role = name === "admin" ? "admin" : "user";
    accountMap.set(password, { name, role });
  }

  console.log(`[ACCOUNTS] Loaded ${accountMap.size} accounts: ${[...accountMap.values()].map(a => a.name).join(", ")}`);
  return accountMap;
}

/** Authenticate password -> { name, role } or null */
export function authenticate(password) {
  const accounts = loadAccounts();
  return accounts.get(password) || null;
}

/** Get all account names (non-admin) */
export function getAccountNames() {
  const accounts = loadAccounts();
  return [...accounts.values()].filter(a => a.role !== "admin").map(a => a.name);
}

/** Check if a password is valid */
export function isValidPassword(password) {
  return authenticate(password) !== null;
}
