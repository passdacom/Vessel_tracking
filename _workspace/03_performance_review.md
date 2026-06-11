# 성능 리뷰

## 리뷰 개요
- **검토 대상**: `ShippingLanes/LaneEditor.jsx` (프론트엔드), `routes/lanes.js` (백엔드)
- **성능 수준 평가**: 🟡 현재 규모(소규모 항로)에서 허용 가능하나 항로 수 증가 시 일부 병목 가시화
- **총 발견 수**: 🔴 2 / 🟡 3 / 🟢 2

---

## 성능 이슈 발견 사항

| # | 파일:라인 | 문제 | 영향 | 해결책 | 심각도 |
|---|----------|------|------|--------|--------|
| 1 | `LaneEditor.jsx:116-134` | `handleLineClick` 내부에서 `toGeoJSON(waypoints)` 를 매 클릭마다 호출 — waypoints 배열 전체 순회 발생 | 클릭 1회 = O(N) 변환. waypoints가 100개라면 클릭할 때마다 100번 좌표 변환. 실측 영향은 낮지만 불필요한 연산 | `useMemo`로 `toGeoJSON(waypoints)` 결과 캐싱 — waypoints 의존 | 🟡 |
| 2 | `LaneEditor.jsx:42-59` | `simplifyAdaptive` do-while 루프: `tolerance < 10` 조건으로 종료하나 tolerance가 `0.02 * 1.5^k`로 증가하므로 실제 최대 반복 횟수는 약 **24회** (0.02 × 1.5^24 ≈ 10.56) — 계산적으로 유한하나 반복마다 `turf.simplify` (Ramer–Douglas–Peucker) 호출 | 입력 포인트 수 M에 대해 `turf.simplify`는 O(M log M). 최악 24회 × O(M log M) 반복. 항적 1,000 포인트 기준 최대 24회 simplify 수행 가능 | `MAX_ITERATIONS` 상수(예: 10)로 루프 상한 명시, 또는 이분 탐색(binary search)으로 tolerance 결정 | 🔴 |
| 3 | `LaneEditor.jsx:12-28` | `makeWpIcon(color, mode)` 가 `waypoints.map()` 렌더 루프 내에서 웨이포인트 수만큼 호출됨 (라인 378, 없이도 mode/color가 바뀔 때마다 전체 재생성) — 매 렌더마다 `L.divIcon` 객체를 N개 신규 생성 | waypoints 100개 기준 렌더마다 `L.divIcon` 100개 생성. Leaflet이 이전 아이콘을 참조할 수 없어 마커 DOM 재생성 트리거 가능 | `makeWpIcon`의 결과를 `useMemo([color, mode])`로 1개만 캐싱 — 동일 mode/color에서 모든 마커가 같은 아이콘 객체를 공유 | 🔴 |
| 4 | `LaneEditor.jsx:371-411` | `waypoints.map((wp, idx) => ...)` 에서 key로 `wp-${idx}` (인덱스 기반) 사용 — 중간 삽입/삭제 시 삽입 지점 이후 모든 마커의 key가 변경됨 | 웨이포인트 중간 삽입(`handleLineClick`) 시 삽입 지점 이후 마커 전체가 React unmount → remount 됨. 100개 포인트 중간에 삽입 시 최대 99개 마커 DOM 재생성. Leaflet 마커는 DOM 생성 비용이 큼 | 좌표 기반 안정 key 사용: `` key={`wp-${wp[0].toFixed(5)}-${wp[1].toFixed(5)}`} `` — 중복 좌표 충돌 가능성은 거의 없으며 삽입/삭제 시 이동하지 않은 마커 재활용 가능 | 🟡 |
| 5 | `LaneEditor.jsx:116-134` | `useCallback` 의존성 배열 `[mode, waypoints]` — `waypoints`를 의존성으로 포함하므로 웨이포인트 추가/이동/삭제 시마다 `handleLineClick` 함수 객체 재생성. `<Polyline eventHandlers={{ click: handleLineClick }}>`에 매번 새 참조가 전달됨 | 웨이포인트 변경마다 Polyline의 eventHandlers prop이 새 객체 → Leaflet이 이벤트 리스너를 탈착/재부착. 잦은 포인트 이동 중에는 리스너 교체가 반복됨 | `waypoints`를 `useRef`로 관리하거나 `setWaypoints` 함수형 업데이트를 이용해 의존성 제거: `handleLineClick`에서 `waypointsRef.current` 참조 | 🟡 |
| 6 | `lanes.js:35-48` | `GET /api/lanes` 의 `findMany` 에 `take`/`skip` 없음 — 항로 수가 늘어나면 전체 조회 | 항로 1,000건 기준 전체 JSON 직렬화 후 클라이언트 전송. 각 항로의 `coordinates` JSON 필드가 수백 포인트를 가질 경우 응답 페이로드가 MB 단위로 증가 | `take`/`skip` 페이지네이션 파라미터 추가, 또는 목록 조회 시 `coordinates` 제외 (`select: { id, name, color, active, createdAt }`) 후 단건 조회 시 좌표 포함 | 🟡 |
| 7 | `lanes.js` / `schema.prisma:143-155` | `ShippingLane.coordinates` 가 `Json` 타입(PostgreSQL `jsonb`)으로 저장되나 `@@index`는 `active`, `createdAt`만 존재 — 좌표 범위 조회 인덱스 없음 | 현재 쿼리는 좌표 기준 필터를 하지 않으므로 즉각적 영향 없음. 그러나 향후 bbox 기반 항로 검색(특정 해역 내 항로 조회) 추가 시 전체 `jsonb` 컬럼 순회 필요 | 현재 쿼리 패턴에서는 불필요. bbox 검색이 필요해지면 PostgreSQL `jsonb` GIN 인덱스 또는 coordinates를 PostGIS geometry로 마이그레이션 고려 | 🟢 |
| 8 | `lanes.js:155-171` | `DELETE` 핸들러에서 `findUnique` 후 `delete` — 2회 왕복 | 존재 확인용 `findUnique` 1회 + `delete` 1회 = 2 DB 왕복. 삭제 빈도가 낮아 실측 영향은 없으나 패턴 비효율적 | `delete` 단독 호출 후 `P2025` 에러 코드로 404 처리 (이미 PUT 핸들러에서 동일 패턴 사용 중, 148라인 참고) — DELETE도 동일하게 통일 | 🟢 |

---

## 상세 분석

### [LaneEditor.jsx:42-59] simplifyAdaptive 루프 상한 분석

```js
let tolerance = 0.02;
do {
  simplified = turf.simplify(line, { tolerance, highQuality: true });
  tolerance *= 1.5;
} while (simplified.geometry.coordinates.length > 30 && tolerance < 10);
```

tolerance 진행: `0.02 → 0.03 → 0.045 → ... → 10.56` (24스텝).
`highQuality: true` 옵션은 Ramer–Douglas–Peucker 대신 Visvalingam–Whyatt 알고리즘을 사용하여
O(M log M) 복잡도. 입력 1,000 포인트 + 24회 반복 시 최악 24 × O(1000 × 10) ≈ 240,000 연산.

항적 hours=2160 (90일) 조회 시 positions 수는 최대 수백~수천 개로,
simplifyAdaptive가 하나의 import 작업에서 수초 블로킹 가능.

**권장 수정**:
```js
function simplifyAdaptive(lonLatCoords) {
  if (lonLatCoords.length < 2) return lonLatCoords;
  const line = turf.lineString(lonLatCoords);
  let tolerance = 0.02;
  const MAX_ITER = 10;  // 추가: 최대 반복 10회 (tolerance 상한 ~0.02*1.5^10 ≈ 1.15)
  let iter = 0;
  let simplified;
  do {
    simplified = turf.simplify(line, { tolerance, highQuality: false }); // highQuality: false로 성능 우선
    tolerance *= 1.5;
    iter++;
  } while (simplified.geometry.coordinates.length > 30 && tolerance < 10 && iter < MAX_ITER);
  // ... 나머지 동일
}
```

---

### [LaneEditor.jsx:12-28, 371-411] makeWpIcon 캐싱 및 key 안정성

**현재**:
```jsx
// 렌더마다 N번 호출 — waypoints.map 내부
icon={makeWpIcon(color, "move")}   // 라인 378
```

**권장**:
```jsx
// 컴포넌트 상단에서 useMemo로 1개만 생성
const wpIcon = useMemo(() => makeWpIcon(color, mode), [color, mode]);

// map 내부에서 공유
icon={wpIcon}
```

**key 안정화**:
```jsx
// 현재 (인덱스 기반 — 중간 삽입 시 전체 재마운트)
key={`wp-${idx}`}

// 개선 (좌표 기반 — 이동하지 않은 마커 재활용)
key={`wp-${wp[0].toFixed(5)}-${wp[1].toFixed(5)}`}
```

---

### [LaneEditor.jsx:116-134] handleLineClick useMemo + useCallback 최적화

**현재 문제**:
1. `toGeoJSON(waypoints)` — 매 클릭마다 waypoints 전체 재변환
2. 의존성에 `waypoints` 포함 → 포인트 변경마다 함수 재생성 → Polyline 이벤트 리스너 재부착

**권장**:
```jsx
// 1) GeoJSON 좌표 메모화
const geoJSONWaypoints = useMemo(() => toGeoJSON(waypoints), [waypoints]);

// 2) handleLineClick에서 ref 활용하여 waypoints 의존성 제거
const waypointsRef = useRef(waypoints);
useEffect(() => { waypointsRef.current = waypoints; }, [waypoints]);

const handleLineClick = useCallback((e) => {
  if (mode !== "add" || waypointsRef.current.length < 2) return;
  e.originalEvent?.stopPropagation();
  const clickPt = turf.point([e.latlng.lng, e.latlng.lat]);
  const line = turf.lineString(toGeoJSON(waypointsRef.current));
  const nearest = turf.nearestPointOnLine(line, clickPt);
  const insertAfter = nearest.properties.index ?? 0;
  setWaypoints((prev) => [
    ...prev.slice(0, insertAfter + 1),
    [e.latlng.lat, e.latlng.lng],
    ...prev.slice(insertAfter + 1),
  ]);
}, [mode]); // waypoints 제거 → mode 변경 시에만 재생성
```

---

### [lanes.js:35-48] findMany 페이지네이션 및 좌표 필드 분리

**현재**:
```js
const lanes = await prisma.shippingLane.findMany({
  where,
  orderBy: { createdAt: "asc" },
  // take/skip 없음, coordinates 포함 전체 조회
});
```

**권장 (목록 조회에서 좌표 제외)**:
```js
const lanes = await prisma.shippingLane.findMany({
  where,
  orderBy: { createdAt: "asc" },
  take: parseInt(req.query.limit) || 200,  // 상한 설정
  skip: parseInt(req.query.offset) || 0,
  select: {
    id: true,
    name: true,
    description: true,
    color: true,
    active: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
    // coordinates 제외 — 단건 GET /:id 에서만 포함
  },
});
```

단, 프론트엔드가 목록 조회 결과를 지도 렌더링에 바로 사용한다면
좌표 제외 후 단건 지연 로딩(lazy load)으로 변경 필요.
현재 `ShippingLanes` 컴포넌트의 사용 패턴을 확인 후 적용 여부 결정 권장.

---

## 복잡도 요약

| 함수 / 쿼리 | 시간 복잡도 | 호출 빈도 | 우선순위 |
|------------|-----------|----------|---------|
| `simplifyAdaptive` | O(M log M × 최대 24) | import 1회 | 🔴 |
| `makeWpIcon` in render | O(N) 아이콘 생성 | 매 렌더 | 🔴 |
| `handleLineClick` toGeoJSON | O(N) 좌표 변환 | 매 클릭 | 🟡 |
| `waypoints.map` key 불안정 | O(N) DOM 재마운트 | 중간 삽입마다 | 🟡 |
| `handleLineClick` useCallback | 함수 재생성 + Leaflet 리스너 교체 | 포인트 변경마다 | 🟡 |
| `findMany` 무제한 조회 | O(항로 수 × 좌표 크기) | GET /api/lanes 호출마다 | 🟡 |
| `DELETE` 이중 왕복 | O(1) × 2 DB 왕복 | 삭제 시 | 🟢 |
| jsonb 인덱스 부재 | 현재 쿼리 미해당 | bbox 검색 추가 시 | 🟢 |

---

## 전반적 평가

**프론트엔드 (LaneEditor.jsx)**

현재 코드에서 실질적 성능 위험은 두 가지다.

첫째, `simplifyAdaptive`의 최대 반복 횟수가 코드 상에 명시적으로 제한되지 않는다.
`tolerance < 10` 조건이 수학적으로 24회 이내를 보장하지만 의도가 코드에 드러나지 않고,
`highQuality: true` 옵션이 각 반복의 비용을 높인다.
90일 항적(수천 포인트) import 시 UI가 수 초간 블로킹될 수 있다.

둘째, `makeWpIcon`이 렌더마다 N개 새 객체를 생성하고 key가 인덱스 기반이라
중간 삽입 시 대다수 Leaflet 마커가 강제 재마운트된다.
항로 에디터는 잦은 포인트 조작이 핵심 UX이므로 이 두 이슈가 체감 성능에 직접 영향을 준다.

`useMemo`로 아이콘 1개를 공유하고 좌표 기반 key로 전환하면
코드 변경 규모는 최소이나 마커 렌더링 성능이 의미 있게 개선된다.

**백엔드 (lanes.js)**

현재 항로 수가 수십 건 이하라면 병목이 없다.
다만 `findMany` 무제한 조회는 항로 수 × 좌표 수가 증가할수록 응답 크기와 직렬화 비용이 함께 커진다.
목록 API에서 `coordinates` 필드를 제외하는 것이 가장 효과 대비 코드 변경이 작은 개선이다.

PostgreSQL `jsonb` 인덱스는 현재 쿼리 패턴(전체 목록 / 단건 ID 조회)에서는 불필요하며,
bbox 기반 공간 검색을 추가하기 전까지는 추가 인덱스가 오히려 쓰기 오버헤드만 증가시킨다.
