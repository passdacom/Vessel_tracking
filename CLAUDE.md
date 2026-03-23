# Vessel Tracking - Claude 작업 가이드

## ⚠️ 주의: 폴더 구분
- ✅ 운영 폴더: /root/.openclaw/workspace/Vessel_tracking/ (여기서만 작업)
- ❌ 방치 폴더: /root/Vessel_tracking/ (절대 수정 금지)

## 프로젝트 구조
- Frontend: React 18 + Vite (포트 5173) → /frontend
- Backend: Node.js + Express + Prisma/SQLite (포트 3001) → /backend
- Vite 프록시: /api/* → localhost:3001 자동 우회
- Nginx: 포트 18789, /etc/nginx/sites-available/openclaw

## 기술 스택
- Frontend: React 18, Vite, Tailwind CSS, React-Leaflet, Turf.js
- Backend: Node.js, Express, Prisma, SQLite
- 외부 API: Datalastic (선박 위치 폴링, KST 기준 6회/일)

## 프로세스 관리 (PM2)
- 상태 확인: pm2 status
- 재시작: pm2 restart vessel-backend vessel-frontend
- 로그 확인: pm2 logs vessel-backend
- 프론트 로그: pm2 logs vessel-frontend

## 주요 파일
- 앱 진입점: frontend/src/App.jsx (전역 상태, 인증)
- 지도 컨테이너: frontend/src/components/Map/MapIndex.jsx
- 위험구역 렌더링: frontend/src/components/Map/RestrictedZone.jsx
- 사이드바: frontend/src/components/Sidebar/index.jsx
- 강제갱신 모달: frontend/src/components/ApiUpdateModal.jsx
- 백엔드 진입점: backend/src/index.js
- 선박 폴러: backend/src/services/datalasticPoller.js
- DB: backend/prisma/dev.db (SQLite)

## 배포 방식
1. 코드 수정 후 git push (브랜치: claude/vessel-tracking-app-E9py3)
2. 서버에서 git pull
3. pm2 restart vessel-backend vessel-frontend
- 또는 scp 직접 덮어쓰기 후 pm2 restart (빠른 패치용)

## 보안 이슈 (개선 필요)
- App.jsx: 비밀번호 평문(880715) localStorage 저장 중 → 추후 해시 처리 권장
