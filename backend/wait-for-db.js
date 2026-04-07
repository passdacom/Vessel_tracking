#!/usr/bin/env node
/**
 * DB(PostgreSQL) 포트가 열릴 때까지 대기 후 메인 서버를 실행합니다.
 * PM2 시작 스크립트로 사용: node wait-for-db.js
 */
import net from "net";
import { spawn } from "child_process";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = parseInt(process.env.DB_PORT || "5432", 10);
const MAX_WAIT_MS = 120_000; // 최대 2분 대기
const RETRY_INTERVAL_MS = 2_000;

function checkPort(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1500);
    sock
      .on("connect", () => { sock.destroy(); resolve(true); })
      .on("timeout", () => { sock.destroy(); resolve(false); })
      .on("error", () => { sock.destroy(); resolve(false); })
      .connect(port, host);
  });
}

async function waitForDb() {
  const deadline = Date.now() + MAX_WAIT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const ok = await checkPort(DB_HOST, DB_PORT);
    if (ok) {
      console.log(`[wait-for-db] ✅ ${DB_HOST}:${DB_PORT} 연결 확인 (시도 ${attempt}회)`);
      return;
    }
    console.log(`[wait-for-db] ⏳ DB 대기 중... (${attempt}회 시도, ${Math.round((deadline - Date.now()) / 1000)}초 남음)`);
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS));
  }
  console.error(`[wait-for-db] ❌ ${MAX_WAIT_MS / 1000}초 내 DB에 연결하지 못했습니다. 서버를 강제 시작합니다.`);
}

waitForDb().then(() => {
  const child = spawn("node", ["src/index.js"], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
});
