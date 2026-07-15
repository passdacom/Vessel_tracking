const { join } = require("node:path");

const ROOT = __dirname;
const LOG_DIR = process.env.VESSEL_LOG_DIR || join(ROOT, "logs");
const BACKEND_ENV_FILE = process.env.VESSEL_BACKEND_ENV_FILE;

/**
 * PM2 Ecosystem 설정
 * 사용법: pm2 start ecosystem.config.cjs
 *        pm2 restart ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "vessel-backend",
      cwd: join(ROOT, "backend"),
      script: "wait-for-db.js",       // DB 준비 확인 후 src/index.js 실행
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        VESSEL_LOG_DIR: LOG_DIR,
        ...(BACKEND_ENV_FILE ? { VESSEL_BACKEND_ENV_FILE: BACKEND_ENV_FILE } : {}),
      },
      // ── 재시작 정책 ───────────────────────────────────────────────────────
      restart_delay: 10000,            // 재시작 간 10초 대기 (DB 부팅 시간 확보)
      autorestart: true,
      max_restarts: 15,                // 최대 15회 재시작 시도
      min_uptime: "30s",               // 30초 이상 유지되면 정상 기동으로 판단
      exp_backoff_restart_delay: 100,  // 지수 백오프: 100ms → 200 → 400 → ... (max 16s)
      max_memory_restart: "512M",
      kill_timeout: 10000,
      listen_timeout: 15000,
      // ── 로그 ──────────────────────────────────────────────────────────────
      out_file: join(LOG_DIR, "backend-out.log"),
      error_file: join(LOG_DIR, "backend-err.log"),
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // ── 워처 ──────────────────────────────────────────────────────────────
      watch: false,                    // 프로덕션에서 파일워처 비활성화
    },
    {
      name: "vessel-frontend",
      cwd: join(ROOT, "frontend"),
      script: "server.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "5173",
        BACKEND_URL: "http://127.0.0.1:3001",
        VESSEL_LOG_DIR: LOG_DIR,
      },
      restart_delay: 3000,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "256M",
      kill_timeout: 10000,
      listen_timeout: 15000,
      out_file: join(LOG_DIR, "frontend-out.log"),
      error_file: join(LOG_DIR, "frontend-err.log"),
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      watch: false,
    },
  ],
};
