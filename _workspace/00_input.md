---
리뷰 요청: Vessel Tracking App 전체 코드 리뷰 + 기능 고도화
날짜: 2026-04-09
---

## 대상 코드
- 백엔드: `/root/.openclaw/workspace/Vessel_tracking/backend/src/` (Node.js/Express/Prisma)
- 프론트엔드: `/root/.openclaw/workspace/Vessel_tracking/frontend/src/` (React 18/Vite)

## 기술 스택
- Backend: Node.js, Express, Prisma ORM, PostgreSQL, node-cron, ws(WebSocket)
- Frontend: React 18, Vite, Tailwind CSS, React-Leaflet, Turf.js
- 외부 API: Datalastic (AIS 위치 폴링, 20,000 credits/월)

## 핵심 파일 구조
```
backend/src/
  index.js           - 서버 진입점, 인증 미들웨어, 라우트 등록
  accounts.js        - 다계정 인증 (캐시 포함)
  routes/
    vessels.js       - CRUD + 위치 이력 + 검색
    admin.js         - 어드민 전용 (overview, vessels, accounts, zone-events)
    shares.js        - 공유 뷰 토큰
    ports.js         - 항구 목록
  services/
    datalasticPoller.js  - AIS 폴링 (cron 스케줄, 하드코딩된 시간)
    wsServer.js          - WebSocket 서버
    geofenceChecker.js   - 지오펜스 이벤트
    cleanup.js           - 오래된 데이터 정리

frontend/src/
  App.jsx              - 전역 상태, 인증
  components/
    AdminDashboard.jsx  - 어드민 대시보드 (계정/선박/API 현황)
    Sidebar/index.jsx   - 사이드바
    Map/index.jsx       - 지도 컨테이너
    ...
```

## DB 스키마 요약
- Vessel: mmsi(UNIQUE), account, active, infoFetched
- Position: vesselId, lat, lon, timestamp(UNIQUE per vessel), suspicious
- Account: name(UNIQUE), password(평문), role
- ApiUsage: endpoint, credits, account
- ZoneEvent: vesselId, zoneName, eventType
- SharedView: token, vesselIds

## 주요 발견 이슈 (오케스트레이터 사전 파악)
1. **보안**: 비밀번호 평문 저장/전송 (localStorage + Bearer token)
2. **보안**: WebSocket URL에 토큰 노출 (`ws://...?token=PASSWORD`)
3. **아키텍처**: Vessel.mmsi가 UNIQUE → 같은 선박을 여러 계정에 추가 불가
4. **기능 누락**: 로깅 시스템 없음 (console.log만 사용)
5. **기능 누락**: 계정별 최대 선박 수 제한 없음
6. **기능 누락**: Admin에서 계정 생성/삭제 불가
7. **기능 누락**: 폴링 주기/시간이 하드코딩
8. **성능**: pollPositions()에서 모든 선박을 순차 처리 (병렬화 가능)
9. **아키텍처**: datalasticPoller.js에 forceUpdate 로직 중복 (pollPositions와 동일)

## 요청 기능
1. 로깅 시스템: 일자별 파일, 라인 초과 시 파일 분할
2. Admin 계정 권한 확장: 계정 추가/삭제, 계정별 선박 수 제한(기본 100), 폴링 스케줄 설정 UI
3. 다계정 동일 선박 공유: 중복 API 호출 없이 여러 계정에서 같은 선박 조회 가능
