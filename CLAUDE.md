# Vessel Tracking - Claude 작업 가이드

## ⚠️ 주의: 폴더 구분
- ✅ 운영 폴더: /root/.openclaw/workspace/Vessel_tracking/ (여기서만 작업)
- ❌ 방치 폴더: /root/Vessel_tracking/ (절대 수정 금지)

---

## 프로젝트 구조

```
Vessel_tracking/
├── backend/
│   ├── src/
│   │   ├── index.js              # 진입점: Express, Prisma, WS, Cron 초기화
│   │   ├── accounts.js           # 계정 인증 (DB 기반 멀티 어카운트)
│   │   ├── sessions.js           # 세션 토큰 관리
│   │   ├── colors.js             # 선박 색상 팔레트
│   │   ├── routes/
│   │   │   ├── vessels.js        # 선박 CRUD, 위치 조회, 수동 입력
│   │   │   ├── lanes.js          # 표준 항로(ShippingLane) CRUD (admin 전용)
│   │   │   ├── ports.js          # 항구 검색 API
│   │   │   ├── admin.js          # 어드민 대시보드 API (계정관리, API 사용량 등)
│   │   │   └── shares.js         # 공유 링크 생성/조회 (인증 불필요)
│   │   ├── services/
│   │   │   ├── datalasticPoller.js  # 핵심 폴링: IMO 우선, MMSI 폴백, cron 기반
│   │   │   ├── geofenceChecker.js   # War Risk Zone 진입/이탈 감지 (Ray Casting)
│   │   │   ├── wsServer.js          # WebSocket 서버 (위치 업데이트 브로드캐스트)
│   │   │   ├── cleanup.js           # 90일 이상 Position 레코드 매일 자정 삭제
│   │   │   ├── aisStream.js         # (레거시, 비활성) AISStream.io WebSocket
│   │   │   └── vesselFinderPoller.js # (레거시, 비활성) VesselFinder REST 폴러
│   │   └── utils/
│   │       └── logger.js         # 구조화 로거 (파일 + 콘솔)
│   └── prisma/
│       └── schema.prisma         # PostgreSQL 스키마
├── frontend/
│   └── src/
│       ├── App.jsx               # 루트: 전역 상태, 인증, 레이아웃
│       ├── utils/
│       │   └── etaCalc.js        # Turf.js 기반 항로 snap ETA 계산
│       └── components/
│           ├── Map/
│           │   ├── index.jsx             # Leaflet 지도 컨테이너
│           │   ├── VesselMarker.jsx      # 선박 마커 + 팝업
│           │   ├── VesselTrack.jsx       # 항적 선
│           │   ├── ShippingLaneLayer.jsx # 표준 항로 렌더링
│           │   ├── RestrictedZone.jsx    # War Risk Zone 폴리곤 렌더링
│           │   ├── PortMarker.jsx        # 항구 마커
│           │   └── DraggableVesselLabel.jsx # 드래그 가능한 선박명 라벨
│           ├── Sidebar/
│           │   ├── index.jsx      # 선박 목록 사이드바 (그룹별 아코디언)
│           │   ├── VesselCard.jsx # 개별 선박 카드 (선택 시 상세 정보)
│           │   └── PortList.jsx   # 항구 목록 패널
│           ├── ShippingLanes/
│           │   ├── LaneManager.jsx  # 항로 목록 + 에디터 컨테이너 (admin 전용)
│           │   ├── LaneList.jsx     # 항로 목록 패널
│           │   └── LaneEditor.jsx   # 항로 편집 지도 (Add/Move/Delete/Select 모드)
│           ├── EtaPanel.jsx          # ETA/거리 계산 패널
│           ├── GlobalTimePanel.jsx   # 전체 선박 시간 이동 패널
│           ├── PlaybackPanel.jsx     # 개별 선박 플레이백 패널
│           ├── AdminDashboard.jsx    # 어드민 대시보드 (계정관리, API 사용량)
│           ├── ZoneSettingsPanel.jsx # War Risk Zone 설정 패널
│           ├── SettingsModal.jsx     # 앱 설정 모달
│           ├── GroupManageModal.jsx  # 그룹 관리 모달
│           ├── AddVesselModal.jsx    # 선박 등록 모달
│           ├── ApiUpdateModal.jsx    # API 강제 수신 모달
│           ├── ArchivedVesselsModal.jsx # 아카이브된 선박 목록
│           ├── ManualPositionModal.jsx  # 수동 위치 입력 모달
│           ├── SharePanel.jsx        # 공유 링크 생성 패널
│           ├── SharedView.jsx        # 공유 링크 뷰어 (비인증)
│           ├── LoginPage.jsx         # 로그인 페이지
│           └── UserGuide.jsx         # 사용자 매뉴얼
└── ecosystem.config.cjs          # PM2 설정
```

---

## 기술 스택

| 영역 | 내용 |
|------|------|
| Frontend | React 18, Vite (dev server), Tailwind CSS, React-Leaflet, Turf.js |
| Backend | Node.js (ESM), Express, Prisma ORM, PostgreSQL |
| 프로세스 관리 | PM2 (`vessel-backend` port 3001, `vessel-frontend` Vite port 5173) |
| 리버스 프록시 | Nginx (포트 18789) → `/api/*`는 backend, 나머지는 Vite |
| 외부 API | Datalastic (선박 위치/제원 폴링) |

### Vite에 대해
Vite는 **프론트엔드 개발 서버 겸 빌드 도구**입니다.  
브라우저가 직접 실행할 수 없는 JSX와 ESM import를 실시간 변환(HMR)해줍니다.  
현재는 `vite dev` 모드로 PM2에 의해 상시 기동 중입니다.  
운영 배포 시에는 `vite build`로 정적 파일 생성 후 Nginx가 직접 서빙하는 방식으로 전환 가능합니다.

---

## 프로세스 관리 (PM2)

```bash
pm2 status                                    # 전체 상태 확인
pm2 restart vessel-backend vessel-frontend    # 재시작
pm2 logs vessel-backend                       # 백엔드 로그
pm2 logs vessel-frontend                      # Vite 로그 (빌드 에러 확인용)
```

---

## 데이터베이스 (PostgreSQL)

### Prisma 명령어
```bash
cd backend
npx prisma db push        # 스키마 → DB 동기화 (dev)
npx prisma migrate dev    # 마이그레이션 생성
npx prisma generate       # 스키마 변경 후 클라이언트 재생성
```

### 주요 모델
| 모델 | 설명 |
|------|------|
| `Vessel` | 선박 레지스트리 + 제원. `(account, mmsi)` unique |
| `Position` | 시계열 위치 데이터. `(vesselId, timestamp)` 인덱스. 90일 후 자동 삭제 |
| `ShippingLane` | 표준 항로. `coordinates: Json` — GeoJSON 순서 `[lon, lat]` |
| `ZoneEvent` | War Risk Zone 진입/이탈 이벤트 로그 |
| `Port` | 항구 DB (ETA 패널 항구 검색용) |
| `Account` | 멀티 어카운트 (admin/user role, 선박 수 제한) |
| `SystemConfig` | 동적 설정 키-값 저장 (e.g. `poll_cron`) |
| `ApiUsage` | Datalastic API 크레딧 사용량 로그 |
| `Incident` | War Risk 사건 데이터 |
| `SharedView` | 공유 링크 토큰 + 선박 목록 |

---

## 폴링 시스템 (Datalastic)

- **식별 우선순위**: IMO 번호 → MMSI (IMO 없는 경우)
- **스케줄**: DB `SystemConfig.poll_cron` 값 사용 (없으면 기본값 `0 4,6,8,11,15,23 * * *` = KST 13:00, 15:00, 17:00, 20:00, 00:00, 08:00)
- **동적 변경**: Admin 대시보드에서 cron 표현식 실시간 변경 가능
- **ETA/destination fallback**: trackHours 창 밖에서도 전체 히스토리 중 최근 값 조회

---

## 인증

- 멀티 어카운트 (DB `Account` 테이블 기반)
- Bearer 토큰 → 세션 기반 (`sessions.js`)
- `/api/shares` 라우트는 인증 면제
- Admin role: 항로 CRUD, 계정 관리, API 강제 수신 등 접근 가능

---

## War Risk Zone (지오펜싱)

- `geofenceChecker.js`: `frontend/public/` 의 GeoJSON 파일 메모리 로드
- 검사 대상: `war-risk-zone.geojson`, `12nm_bounds.geojson`, `war-risk-zone-global.geojson`
- 폴링 시마다 각 선박 위치를 검사, 진입/이탈 시 `ZoneEvent` 기록 + WebSocket 브로드캐스트

---

## 표준 항로 (ShippingLane) 좌표 규칙

- DB 저장 / Turf.js / GeoJSON: `[lon, lat]` 순서
- React-Leaflet 화면 표시: `[lat, lon]` 순서
- `etaCalc.js`의 `MAX_SNAP_DIST_NM = 500`: 선박 또는 목적지가 항로에서 500nm 이상 떨어진 경우 해당 항로를 ETA 계산에서 제외

---

## 배포 방식

```bash
# 1. 코드 수정 후
git push  # 브랜치: claude/add-war-risk-areas-3y4LA

# 2. 서버에서
git pull
pm2 restart vessel-backend vessel-frontend
```

빠른 패치: scp로 파일 직접 덮어쓰기 후 `pm2 restart`

---

## 알려진 이슈 / 개선 필요

- 동해/서해 한국식 표기: Vworld 타일 또는 MapLibre GL 전환 필요 (현재 OpenStreetMap)
- Vite dev 모드 운영 중: 정식 배포 시 `vite build` + Nginx 정적 서빙으로 전환 권장
- Port DB: 사전 시딩 필요 (빈 테이블이면 ETA 패널 항구 검색 결과 없음)
