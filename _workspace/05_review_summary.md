# 최종 리뷰 요약

**기준일**: 2026-04-19
**대상 모듈**: LaneEditor / LaneList / LaneManager / lanes.js / etaCalc.js / EtaPanel.jsx

---

## 판정: Request Changes

보안 Critical 2건(기존 평문 비밀번호)이 여전히 미해결 상태이고, 신규 lanes 모듈에서 Medium 보안 이슈 3건이 추가되었으며, 아키텍처상 핵심 데이터 흐름(App.jsx lanes 상태 연결)이 완전히 닫히지 않아 현 상태에서 병합은 부적절하다. P1 항목 처리 후 재검토하면 Approved 가능한 수준이다.

---

## 잔여 이슈 (구현 후에도 남은 것)

심각도 순 정렬.

### [Critical] 비밀번호 평문 저장 · localStorage 노출 · WebSocket URL 노출 (기존 미해결)
- **위치**: `accounts.js:17`, `App.jsx:151`, `App.jsx:325`, `wsServer.js:11`
- **내용**: 비밀번호가 DB에 평문으로 저장되고 `localStorage`에도 그대로 보관된다. WebSocket 연결 URL 쿼리 파라미터(`?token=PASSWORD`)에도 평문이 노출되어 Nginx 액세스 로그에 기록된다. XSS 발생 시 즉시 탈취 가능. CVSS 7.5~8.1.
- **요구 조치**: bcrypt 해시 전환 + WS 인증을 URL 쿼리가 아닌 연결 후 첫 메시지로 전환. 이번 PR 범위 외이지만 ShippingLanes 신규 코드가 동일 인증 인프라를 재사용하므로 조기 수정 필요.

### [High] adminGuard 순서 오류 — GET /:id가 권한 검사 우회 (FINDING-L1)
- **위치**: `lanes.js:51`, `lanes.js:65`
- **내용**: `GET /:id` 라우트가 `router.use(adminGuard)` 이전에 등록되어 adminGuard를 거치지 않는다. 전역 인증 미들웨어가 있어 완전 무방비는 아니나, GET이 "모든 인증 사용자 허용"임을 코드 구조가 표현하지 못해 향후 오해 및 실수 위험이 높다.
- **요구 조치**: 라우트별 명시적 미들웨어 인수 방식(`router.get("/:id", optionalAuth, handler)`)으로 변경하거나, 경계 주석을 명확히 추가.

### [High] express.json payload 제한 미확인 (FINDING-L2 부분)
- **위치**: `index.js` (express.json 미들웨어 설정)
- **내용**: `validateCoordinates()`에 좌표 500개 상한이 추가되었으나(구현 완료), `express.json({ limit: "1mb" })` 전역 payload 제한 설정 여부가 불확실하다. Body가 파싱되기 전 거대 payload가 메모리에 올라오는 경로가 남아 있을 수 있다.
- **요구 조치**: `index.js`에서 `express.json({ limit: "1mb" })` 설정 여부 확인 및 미설정 시 추가.

### [Medium] `?active=all` 파라미터로 비admin이 비활성 항로 조회 가능 (FINDING-L5)
- **위치**: `lanes.js:37`
- **내용**: 운영자가 숨김 처리한 비활성 항로를 일반 사용자가 `?active=all` 파라미터로 조회할 수 있다.
- **요구 조치**: `const showAll = req.query.active === "all" && req.accountRole === "admin";` (1줄 수정).

### [Medium] `createdBy` 등 내부 필드 비admin 노출 (FINDING-L4)
- **위치**: `lanes.js:43`, `LaneList.jsx:182`
- **내용**: Prisma 전체 필드가 직렬화되어 반환되므로 생성자 계정명이 일반 사용자에게도 노출된다.
- **요구 조치**: Prisma `select` 화이트리스트 적용 또는 role별 필드 필터링.

### [Medium] color 값 미검증 divIcon HTML 보간 — CSS/XSS 주입 가능 (FINDING-L3)
- **위치**: `LaneEditor.jsx:18`
- **내용**: 서버 측 정규식 검증이 올바르게 적용되어 현재 위험은 낮으나, 프론트엔드에서 별도 검증 없이 DB 값을 직접 `innerHTML`에 보간한다. DB 직접 조작 또는 미래 검증 누락 시 CSS injection → XSS로 발전 가능.
- **요구 조치**: `sanitizeColor(val)` 함수 추가(`/^#[0-9a-fA-F]{6}$/`) 후 `makeWpIcon` 진입 시 검증.

### [Medium - Architecture] lanes 상태가 App.jsx에 없어 Map 연동 미완 (아키텍처 이슈 #1)
- **위치**: `App.jsx` 전체, `Map/index.jsx`
- **내용**: 구현 현황에서 `ShippingLaneLayer` 컴포넌트가 추가되었다고 명시되어 있으나, App.jsx에 `lanes` 상태와 `/lanes` 초기 로드 로직이 없으면 Map에 데이터가 전달되지 않는다. ETA 기능도 동일한 전제 조건이다.
- **요구 조치**: App.jsx에 `const [lanes, setLanes] = useState([])` + `/lanes` 초기 로드 useEffect 추가, `<Map lanes={lanes} />` 전달 (약 15줄).

### [Medium - Architecture] `handleSaved()`가 저장된 항로 데이터를 버림 (아키텍처 이슈 #2)
- **위치**: `LaneManager.jsx:33-37`
- **내용**: `LaneEditor.onSave(saved)`로 전달되는 서버 응답 객체가 `LaneManager.handleSaved`에서 무시된다. 저장 후 App.jsx lanes 상태 실시간 동기화 경로가 없다.
- **요구 조치**: `handleSaved(savedLane)` 인자 수용 + `onLaneSaved?.(savedLane)` 콜백 전파.

### [Medium - Architecture] LaneEditor가 `/admin/vessels` 직접 호출 (아키텍처 이슈 #3)
- **위치**: `LaneEditor.jsx:81-95`
- **내용**: admin 전용 엔드포인트를 컴포넌트 내부에서 하드코딩 호출. 권한 구조 변경 시 숨겨진 버그 위험.
- **요구 조치**: `vessels` prop 주입 방식으로 전환하거나 일반 `/vessels` 엔드포인트 사용.

### [High - Style] Dead code — LaneList.jsx:151 항상-빈-문자열 삼항 연산자 (스타일 이슈 #1)
- **위치**: `LaneList.jsx:151`
- **내용**: 양쪽 분기가 모두 빈 문자열인 삼항 연산자. 미완성 기능으로 추정되며 의도 파악이 필요하다.
- **요구 조치**: 삭제 또는 의도한 콘텐츠(비활성 항로 수 표시 등)로 교체.

### [Medium - Style] `finally` 미사용으로 인한 로딩 상태 누락 위험 (스타일 이슈 #2)
- **위치**: `LaneEditor.jsx:161-164`, `LaneEditor.jsx:193-195`
- **내용**: `handleImport`/`handleSave`에서 `setImporting(false)` / `setSaving(false)`가 `finally` 없이 try/catch 이후에 위치. 조기 return 추가 시 로딩 상태가 영원히 남는 구조적 결함.
- **요구 조치**: `finally { setXxx(false) }` 패턴으로 전환.

### [Medium - Style+Perf] 배열 인덱스 key — 중간 삽입 시 전체 마커 재마운트 (스타일 #3 / 성능 #4)
- **위치**: `LaneEditor.jsx:371-411`
- **내용**: `key={`wp-${idx}`}` 인덱스 기반 key는 중간 삽입/삭제 시 삽입 지점 이후 모든 마커를 unmount → remount한다. 웨이포인트 편집이 핵심 UX이므로 체감 성능에 직접 영향.
- **요구 조치**: `key={`wp-${wp[0].toFixed(5)}-${wp[1].toFixed(5)}`}` 좌표 기반 key로 전환.

### [Red - Perf] makeWpIcon 렌더마다 N개 재생성 (성능 이슈 #3)
- **위치**: `LaneEditor.jsx:12-28`, `LaneEditor.jsx:378`
- **내용**: `waypoints.map()` 내에서 `makeWpIcon`이 웨이포인트 수만큼 호출되어 매 렌더마다 `L.divIcon` 객체를 N개 신규 생성. Leaflet 마커 DOM 재생성 트리거 가능.
- **요구 조치**: `const wpIcon = useMemo(() => makeWpIcon(color, mode), [color, mode])` 1개만 생성 후 공유.

### [Yellow - Perf] findMany 무제한 조회 — 항로 수 증가 시 응답 크기 폭증 (성능 이슈 #6)
- **위치**: `lanes.js:35-48`
- **내용**: `take`/`skip` 없이 좌표 포함 전체 조회. 항로 수 × 좌표 수 증가 시 응답 크기와 직렬화 비용이 함께 증가.
- **요구 조치**: 목록 조회에서 `coordinates` 필드 제외(`select`), 단건 조회에서만 포함. 또는 `take` 상한 추가.

---

## 이미 해결된 이슈

구현 현황에서 확인된 해결 사항.

| # | 해결된 이슈 | 연관 리뷰 |
|---|------------|----------|
| 1 | LaneEditor: FitBoundsOnLoad 컴포넌트 추가 — 편집 진입 시 항로 위치로 지도 이동 | UX 개선 |
| 2 | LaneEditor: CircleMarker stopPropagation 수정 — add 모드 클릭 이벤트 버블링 버그 해결 | 버그 수정 |
| 3 | LaneEditor: undo 스택 추가 (최대 20단계) — 편집 실수 복구 가능 | UX 개선 |
| 4 | LaneEditor: 초기화 버튼 추가 — 전체 웨이포인트 리셋 기능 | UX 개선 |
| 5 | LaneEditor: simplifyAdaptive 최대 반복 20회 제한 — 무제한 루프 방지 | 성능 이슈 #2 (🔴) 해결 |
| 6 | LaneEditor: toGeoJSON useMemo 캐싱 — 매 클릭마다 waypoints 전체 재변환 방지 | 성능 이슈 #1 (🟡) 해결 |
| 7 | backend/lanes.js: 좌표 최대 500개 제한 — validateCoordinates 상한 추가 | 보안 FINDING-L2 (High) 부분 해결 |
| 8 | 메인 지도: ShippingLaneLayer 컴포넌트로 항로 표시 — 지도 렌더링 레이어 추가 | 아키텍처 이슈 #1 진행 |
| 9 | ETA 계산: etaCalc.js 유틸, EtaPanel.jsx, Map 오버레이 구현 | 아키텍처 ETA 설계 구현 |
| 10 | VesselCard: ETA 버튼 추가 — ETA 기능 진입점 UI 완성 | 아키텍처 설계 반영 |

---

## 권장 후속 작업

### P1 — 반드시 처리 (머지 전)

1. **비밀번호 평문 저장 해소** — bcrypt 전환, localStorage 세션 토큰 방식 전환, WS URL 쿼리 → 연결 후 첫 메시지 인증 전환 (`accounts.js`, `App.jsx`, `wsServer.js`)
2. **`express.json({ limit })` 전역 payload 제한 확인 및 설정** (`index.js`)
3. **lanes 상태를 App.jsx에 추가 + Map에 전달** — ShippingLaneLayer / ETA 기능이 실제로 데이터를 받는지 확인 (약 15줄)
4. **`handleSaved(savedLane)` 콜백 수정** — 저장 후 App.jsx lanes 상태 실시간 반영 (`LaneManager.jsx`)
5. **Dead code 제거** — `LaneList.jsx:151` 항상-빈-문자열 삼항 연산자 삭제 또는 완성

### P2 — 다음 스프린트

6. **`?active=all` admin 전용 제한** (`lanes.js:37`, 1줄 수정)
7. **`createdBy` 필드 비admin 제거** (Prisma `select` 화이트리스트 또는 role별 필터)
8. **adminGuard 순서 명확화** — 라우트별 명시적 미들웨어 또는 경계 주석 추가 (`lanes.js:51,65`)
9. **`sanitizeColor()` 프론트엔드 color 검증 추가** (`LaneEditor.jsx:18`)
10. **`finally` 패턴 전환** (`handleImport`, `handleSave`)
11. **웨이포인트 key 좌표 기반 전환** + **`makeWpIcon` useMemo 캐싱** (`LaneEditor.jsx`)
12. **LaneEditor `/admin/vessels` → vessels prop 주입 방식으로 전환**

### P3 — 기술 부채 (여유 시)

13. **`findMany` 목록 조회에서 `coordinates` 필드 제외** (`lanes.js:35-48`)
14. **`toLeaflet` / `toGeoJSON` → `utils/geo.js` 추출** (재사용성 향상)
15. **타일 설정 → `utils/mapConfig.js` 상수화** (중복 제거)
16. **PUT/PATCH 분리** — 부분 업데이트 vs 전체 교체 의미 명확화 (`lanes.js:103-152`)
17. **낙관적 업데이트** — `LaneList.handleToggleActive`, `handleDelete` UX 개선
18. **adminGuard 거부 이벤트 `logger.warn` 로깅 추가** (`lanes.js`)
19. **`LaneManager.handleSaved` / `handleEditorClose` DRY 정리** — 공통 함수 추출

---

## 종합 평가

ShippingLanes 에디터와 ETA 기능의 핵심 구현 품질은 전반적으로 양호하다. 컴포넌트 책임 분리(`LaneManager` → `LaneList` → `LaneEditor`), `apiFetch` prop 주입 패턴, 서버 측 좌표 유효성 검증 구조는 확장 가능한 설계를 따르고 있다. simplifyAdaptive 반복 제한, toGeoJSON useMemo 캐싱, 좌표 상한 추가 등 성능/DoS 이슈의 상당수가 이미 구현 과정에서 반영된 점은 긍정적이다.

다만 기존부터 누적된 비밀번호 평문 저장(Critical)이 여전히 미해결이고, 신규 lanes 모듈에서 `?active=all` 권한 누락, `createdBy` 필드 노출 등 Medium 보안 이슈가 새로 추가되었다. 아키텍처 측면에서는 App.jsx에 lanes 상태가 없어 ShippingLaneLayer와 ETA 기능이 실제로 데이터를 수신하는지 검증이 불완전한 상태다. P1 항목 5건(비밀번호 처리, payload 제한, App lanes 상태, handleSaved 콜백, dead code)을 처리한 뒤 재검토하면 Approved 판정이 가능하다.
