/**
 * Multi-account authentication
 * 인증 우선순위: ① 세션 토큰(UUID) → ② 비밀번호(하위 호환)
 * 서버 재시작 시 세션이 초기화되어도 비밀번호 폴백으로 무중단 유지
 */

import { getSession } from "./sessions.js";

let cachedAccounts = null;
let cacheExpires = 0;
const CACHE_TTL = 30000; // 30 seconds

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

export function clearAccountCache() {
  cachedAccounts = null;
  cacheExpires = 0;
}

/**
 * 토큰 인증: 세션 토큰 우선, 없으면 비밀번호 폴백
 * @returns {{ name, role } | null}
 */
export async function authenticate(prisma, token) {
  if (!token) return null;

  // ① 세션 토큰 확인 (빠름, in-memory)
  const session = getSession(token);
  if (session) return session;

  // ② 비밀번호 확인 (하위 호환 — 기존 로그인 세션 유지)
  const accounts = await loadAccounts(prisma);
  return accounts.get(token) || null;
}

/** Get all account names (non-admin) */
export async function getAccountNames(prisma) {
  const accounts = await loadAccounts(prisma);
  return [...accounts.values()].filter(a => a.role !== "admin").map(a => a.name);
}
