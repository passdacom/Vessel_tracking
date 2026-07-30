# 코드 리뷰 대상: 항로 관리 시스템 + ETA 계산 기능

## 리뷰 날짜: 2026-04-19
## 스택: Node.js(ESM)+Express+Prisma/PostgreSQL / React 18+Vite+Tailwind+React-Leaflet+Turf.js

---

## 리뷰 파일 목록

### [신규] backend/src/routes/lanes.js
ShippingLane CRUD REST API. GET(인증), POST/PUT/DELETE(admin 전용). validateCoordinates() 헬퍼 포함.

### [신규] frontend/src/components/ShippingLanes/LaneEditor.jsx
지도 기반 항로 편집기. add/move/delete 모드. Turf.js nearestPointOnLine, simplify 사용. 선박 항적 import→Douglas-Peucker 단순화.

### [신규] frontend/src/components/ShippingLanes/LaneList.jsx
항로 목록. 활성화 토글, 편집, 삭제.

### [신규] frontend/src/components/ShippingLanes/LaneManager.jsx
LaneList ↔ LaneEditor 상태 관리 래퍼.

### [수정] frontend/src/App.jsx
adminView에 "lane-manager" 상태 추가. LaneManager 렌더링 분기.

### [수정] frontend/src/components/AdminDashboard.jsx
onOpenLaneManager prop 추가. "항로 관리" 버튼 추가.

---

## 발견된 버그 및 이슈 (사전 분석)

### Critical (즉시 수정 필요)
1. **[BUG] 메인 지도에 항로 미표시**: admin이 항로를 생성해도 메인 지도(Map/index.jsx)에 렌더링되지 않음. lanes 상태가 App.jsx에 없고 Map에 전달되지 않음.
2. **[BUG] LaneEditor 편집 시 지도 위치 미이동**: initialLane이 있어도 지도 center가 [20,68](인도양)로 고정. 기존 항로 편집 시 웨이포인트가 화면에 보이지 않을 수 있음.
3. **[BUG] add 모드 CircleMarker 이벤트 버블링**: add 모드에서 기존 마커 클릭 시 click이 MapClickHandler로 버블링되어 기존 마커 위에 중복 포인트 추가됨.

### Major (주요 기능 누락)
4. **[MISSING] ETA 계산 기능 미구현**: 선박 위치→목적지 ETA 계산이 아직 없음. 핵심 요청 사항.
5. **[MISSING] 항로 방향 표시 없음**: 폴리라인이 단순 선으로만 표시되어 방향을 알 수 없음.

### Minor
6. **[CODE] LaneEditor makeWpIcon()**: isMoved 변수 계산되지만 사용되지 않음 (dead code).
7. **[CODE] LaneList count 텍스트**: `lanes.some((l) => !l.active) ? "" : ""` — 두 분기 모두 "" 반환.
8. **[SECURITY] validateCoordinates**: 좌표 개수 상한 없음 (DoS 가능성: 100만 포인트 전송 시 처리 과부하).
9. **[PERF] LaneEditor handleLineClick**: 매 호출마다 toGeoJSON(waypoints) 호출 → waypoints 변경 없어도 매번 새 배열 생성.
10. **[UX] LaneEditor**: undo 기능 없음, 실수로 삭제한 포인트 복구 불가.

---

## 요청 기능 구현 목록

1. **메인 지도에 항로 표시** (ShippingLaneLayer 컴포넌트)
2. **ETA 계산 기능** (선박 선택 → 목적지 클릭 → 최근접 항로 via snap → 거리/시간 계산 → 지도 표시)
3. **LaneEditor 버그 수정** (FitBounds, 이벤트 버블링)
4. **LaneEditor UX 개선** (undo, 초기화 버튼)
