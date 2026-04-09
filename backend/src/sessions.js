/**
 * In-memory 세션 관리
 * - 로그인 시 UUID 토큰 발급
 * - 서버 재시작 시 세션 초기화 → 비밀번호 폴백(accounts.js)으로 무중단 유지
 */

import { randomUUID } from "crypto";
import { logger } from "./utils/logger.js";

const SESSION_TTL = 24 * 60 * 60 * 1000; // 24시간
const sessions = new Map(); // token → { name, role, expiresAt }

/** 세션 토큰 발급 */
export function createSession(name, role) {
  const token = randomUUID();
  sessions.set(token, { name, role, expiresAt: Date.now() + SESSION_TTL });
  return token;
}

/** 토큰으로 세션 조회 (만료 시 null) */
export function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return { name: s.name, role: s.role };
}

/** 특정 계정의 모든 세션 무효화 (비밀번호 변경 시) */
export function invalidateAccount(accountName) {
  let count = 0;
  for (const [token, s] of sessions) {
    if (s.name === accountName) { sessions.delete(token); count++; }
  }
  if (count > 0) logger.info(`[Sessions] ${accountName} 세션 ${count}개 무효화`);
}

// 매 시간 만료 세션 정리
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, s] of sessions) {
    if (now > s.expiresAt) { sessions.delete(token); removed++; }
  }
  if (removed > 0) logger.debug(`[Sessions] 만료 세션 ${removed}개 정리`);
}, 60 * 60 * 1000);
