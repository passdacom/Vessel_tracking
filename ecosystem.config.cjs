/**
 * PM2 Ecosystem 설정
 * 사용법: pm2 start ecosystem.config.cjs
 *        pm2 restart ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: "vessel-backend",
      cwd: "./backend",
      script: "wait-for-db.js",       // DB 준비 확인 후 src/index.js 실행
      interpreter: "node",
      env: {
        NODE_ENV: "production",
      },
      // ── 재시작 정책 ───────────────────────────────────────────────────────
      restart_delay: 10000,            // 재시작 간 10초 대기 (DB 부팅 시간 확보)
      max_restarts: 15,                // 최대 15회 재시작 시도
      min_uptime: "30s",               // 30초 이상 유지되면 정상 기동으로 판단
      exp_backoff_restart_delay: 100,  // 지수 백오프: 100ms → 200 → 400 → ... (max 16s)
      // ── 로그 ──────────────────────────────────────────────────────────────
      out_file: "./logs/backend-out.log",
      error_file: "./logs/backend-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // ── 워처 ──────────────────────────────────────────────────────────────
      watch: false,                    // 프로덕션에서 파일워처 비활성화
    },
    {
      name: "vessel-frontend",
      cwd: "./frontend",
      script: "node_modules/.bin/vite",
      args: "--host 0.0.0.0 --port 5173",
      env: {
        NODE_ENV: "development",
      },
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      out_file: "./logs/frontend-out.log",
      error_file: "./logs/frontend-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      watch: false,
    },
  ],
};
