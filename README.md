# Vessel Tracking System

실시간 선박 위치 추적 시스템. 선박의 위경도 위치, 항적, 목적지/ETA, 선박 제원을 통합 제공하며 War Risk Zone 감시, 표준 항로 기반 ETA 계산, 멀티 어카운트를 지원합니다.

---

## 시스템 아키텍처

```
브라우저 / https://vessel.ttacom.net
  ↓
Nginx Proxy Manager / reverse proxy
  ↓
vessel-frontend (PM2, Node production static/proxy server, 포트 5173)
  ├── 정적 React production build: frontend/dist
  ├── /api/* → vessel-backend (Node.js/Express, 포트 3001)
  └── /ws    → vessel-backend WebSocket proxy
```

- **Backend**: Node.js (ESM), Express, Prisma ORM, PostgreSQL
- **Frontend**: React 18, Vite build artifact, Tailwind CSS, React-Leaflet, Turf.js
- **Frontend runtime**: `frontend/server.mjs` via PM2 (`NODE_ENV=production`)
- **데이터 소스**: Datalastic API (IMO 우선, MMSI 폴백)

---

## 주요 기능

### 선박 위치 추적
- Datalastic API 주기적 폴링 (기본 KST 13:00, 15:00, 17:00, 20:00, 00:00, 08:00)
- WebSocket으로 위치 업데이트 브로드캐스트
- 위치 데이터 90일 보관 후 자동 삭제
- 시간 이동 / 플레이백 기능

### 선박 정보
- 선종, 국기, 총톤수(GT), 재화중량(DWT), 건조연도
- AIS ETA/목적지 (trackHours 범위 밖 히스토리 fallback 포함)
- 선박별 색상, 별칭 커스터마이징
- 그룹(companyType) 기반 분류

### 표준 항로 (ShippingLane) 관리
- Admin 전용 항로 CRUD
- 지도 기반 에디터: 웨이포인트 추가/이동/삭제, Undo/Redo 20단계
- 항적 → 항로 자동 생성 (Turf.js simplify)
- 즐겨찾기 웨이포인트 (localStorage)

### ETA / 거리 계산
- Turf.js 기반 항로 snap 알고리즘
  - 총 거리 = 선박→진입점(직선) + 항로구간 + 이탈점→목적지(직선)
  - 항로 없으면 Haversine 직선 fallback
  - 선박/목적지가 항로에서 500nm 이상 떨어지면 해당 항로 제외 (잘못된 항로 선택 방지)
- 목적지 설정: 지도 클릭 또는 항구 DB 검색
- 속도 모드: 현재 SOG / 선종별 프리셋 / 직접 입력

### War Risk Zone 감시
- JWC War Risk Zone, 12nm bounds, Global 구역 지원
- 진입/이탈 시 ZoneEvent 기록 + WebSocket 알림
- Ray Casting 알고리즘 (외부 의존성 없음)

### 멀티 어카운트
- DB 기반 계정 관리 (admin/user role)
- 계정별 선박 분리 및 열람 권한 제어
- 세션 토큰 기반 인증

### 공유 링크
- 선택한 선박만 포함하는 공유 URL 생성 (비인증 접근)
- 만료 시간 설정 가능

---

## 실행 방법

```bash
# PostgreSQL 시작
docker-compose up -d

# Backend (.env 필요: DATABASE_URL, DATALASTIC_API_KEY, AUTH_PASSWORD)
cd backend
npm install
npx prisma generate
npm run dev

# Frontend 개발 서버
cd frontend
npm install
npm run dev   # Vite dev server (개발용)

# Frontend production build / local serve
npm run build
npm start     # Node static/proxy server (기본 포트 5173)
```

### PM2 운영
```bash
cd /root/.openclaw/workspace/Vessel_tracking
./scripts/release.sh   # 기본값: side-effect-free dry-run

# 전용 vessel PM2 daemon 상태/로그 확인
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 status
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 logs vessel-backend
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 logs vessel-frontend
```

실제 deploy, 최초 전용 PM2/systemd 이관, DB migration은 모두 Human Gate 대상입니다. 공유 `/root/.pm2`에서 수동 `pm2 start`, `reload all`, `delete all`, `pm2 kill`을 실행하지 마세요.

운영 smoke:

```bash
/root/.openclaw/workspace/Vessel_tracking/scripts/production-smoke.sh
```

자세한 운영/rollback 절차는 `docs/production-runbook.md`를 참고하세요.

---

## 데이터베이스 스키마 (주요 모델)

| 모델 | 설명 |
|------|------|
| `Vessel` | 선박 레지스트리 + 제원. `(account, mmsi)` unique |
| `Position` | 시계열 위치. `(vesselId, timestamp DESC)` 인덱스. 90일 후 자동 삭제 |
| `ShippingLane` | 표준 항로. `coordinates: Json` (`[lon, lat]` GeoJSON 순서) |
| `ZoneEvent` | War Risk Zone 진입/이탈 이벤트 |
| `Port` | 항구 DB (ETA 패널 항구 검색) |
| `Account` | 멀티 어카운트 (role, 선박 수 제한) |
| `SystemConfig` | 동적 설정 (e.g. `poll_cron` cron 표현식) |
| `ApiUsage` | Datalastic 크레딧 사용량 로그 |
| `Incident` | War Risk 사건 데이터 |
| `SharedView` | 공유 링크 토큰 |

---

## 폴링 스케줄 동적 변경

Admin 대시보드에서 `poll_cron` 값을 변경하면 재시작 없이 즉시 반영됩니다.  
기본값: `0 4,6,8,11,15,23 * * *` (UTC 기준, KST +9)

---

## 좌표계 주의사항

- DB / Turf.js / GeoJSON: `[lon, lat]`
- React-Leaflet / 화면 표시: `[lat, lon]`
- `etaCalc.js` 변환: `turf.point([pos.lon, pos.lat])`
