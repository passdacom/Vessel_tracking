const LAST_ACCOUNT_KEY = "vessel_last_account";

export const COMPANY_ACCOUNTS = Object.freeze([
  Object.freeze({ value: "kb", label: "KB" }),
  Object.freeze({ value: "kdgc", label: "KDGC" }),
  Object.freeze({ value: "kre", label: "KRE" }),
]);

const COMPANY_VALUES = new Set(COMPANY_ACCOUNTS.map(({ value }) => value));

export function getRememberedCompany(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const account = target?.getItem(LAST_ACCOUNT_KEY) || "";
    return COMPANY_VALUES.has(account) ? account : "";
  } catch {
    return "";
  }
}

export function rememberCompany(storage, account) {
  if (!COMPANY_VALUES.has(account)) return;
  try {
    const target = storage ?? globalThis.localStorage;
    target?.setItem(LAST_ACCOUNT_KEY, account);
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
}
