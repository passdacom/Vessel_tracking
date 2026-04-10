# 성능 리뷰

## 리뷰 개요
- **성능 수준 평가**: 🟡 개선 여지 — 현재 선박 수(소규모)에서는 허용 가능하나, 30척 초과 시 병목 가시화
- **총 발견 수**: 🔴 3 / 🟡 5 / 🟢 3

---

## 성능 이슈 발견 사항

### 🔴 필수 최적화

---

#### 1. [datalasticPoller.js:122-197 / 223-306] — 카테고리: 순차 IO + 코드 중복

**문제**: `pollPositions()`와 `forceUpdate()` 두 함수가 선박당 3개 직렬 DB 작업(`position.findFirst` → `position.upsert` → 조건부 vessel.update`)을 for 루프로 순차 실행한다. 두 함수의 핵심 로직은 95% 중복이다.

**영향**:
- 선박 N척 기준 폴링 1회 = 최소 2N번 순차 DB 왕복 (findFirst + upsert, vessel.update 제외)
- Datalastic API 호출이 순차라 응답시간 300ms 가정 시: 10척 → 3초, 30척 → 9초, 100척 → 30초
- forceUpdate는 스트리밍 응답 중 블로킹하므로 100척 강제 갱신 시 클라이언트 연결 타임아웃 위험

**현재 코드**:
```js
// pollPositions() — N번 순차
for (const v of vessels) {
  const res = await apiCall("vessel", params);          // 외부 API 직렬 호출
  const prevPos = await prisma.position.findFirst(...); // DB 직렬
  const position = await prisma.position.upsert(...);   // DB 직렬
  await geofenceChecker.detectAndSave(...);             // DB 직렬
}

// forceUpdate() — 동일 로직 복사 (약 80줄 중복)
for (const v of vessels) { /* 위와 동일 구조 */ }
```

**최적화 코드**:
```js
// 1) 공통 핵심 로직을 fetchAndSave(prisma, vessel, ...) 함수로 추출
async function fetchAndSave(prisma, vessel, logger, onPosition, onZoneEvent) {
  const params = vessel.imo ? { imo: vessel.imo } : { mmsi: vessel.mmsi };
  const res = await apiCall("vessel", params);
  if (!res?.data) { logger?.(`⚠ No data: ${vessel.mmsi}`); return null; }
  // ... 파싱, 스푸핑 탐지, upsert, geofence 공통 처리
}

// 2) Promise.allSettled로 병렬화 (Datalastic rate-limit 고려해 청크 분리)
async function pollPositions() {
  const vessels = await prisma.vessel.findMany({ where: { active: true } });
  const CHUNK = 5; // API rate-limit에 맞춰 조정
  for (let i = 0; i < vessels.length; i += CHUNK) {
    const chunk = vessels.slice(i, i + CHUNK);
    await Promise.allSettled(chunk.map(v => fetchAndSave(prisma, v, null, onPosition, onZoneEvent)));
  }
}
```

**개선 효과**:
- 코드 중복 제거: ~80줄 → 1개 함수, 유지보수 포인트 단일화
- CHUNK=5 병렬화 시: 30척 기준 6회 청크 × 300ms = 1.8초 (현재 9초 대비 **5x 단축**)
- forceUpdate 스트리밍 블로킹 시간 동일 비율로 단축

**트레이드오프**: Datalastic API rate-limit(분당 호출 제한)을 반드시 확인 후 CHUNK 크기 설정. 동시 호출이 많으면 429 에러 발생 가능.

---

#### 2. [vessels.js:292-322] — 카테고리: N+1 쿼리 (히스토리 저장)

**문제**: `POST /vessels/:id/history` 핸들러에서 정렬된 레코드를 for 루프로 순회하며 각 레코드마다 `position.findFirst`(이전 위치 조회)를 호출한다. 7일 히스토리 기준 약 42회 폴링 데이터면 42번 순차 SELECT가 발생한다.

**영향**:
- 30일 히스토리(180 레코드) 저장 시: 180번 순차 findFirst + 180번 upsert = 360 DB 왕복
- PostgreSQL 기준 RTT 1ms 가정 시 360ms 추가 오버헤드, 실제 환경에서는 더 클 수 있음
- 레코드가 이미 시간순 정렬되어 있으므로 메모리에서 직전 레코드를 추적하면 DB 조회 불필요

**현재 코드**:
```js
for (const r of sorted) {
  const prevPos = await prisma.position.findFirst({  // N번 DB 호출
    where: { vesselId: id, suspicious: false, timestamp: { lt: timestamp } },
    orderBy: { timestamp: "desc" },
  });
  const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);
  await prisma.position.upsert(...);
}
```

**최적화 코드**:
```js
// sorted는 이미 시간순 정렬 완료 — 이전 레코드를 변수로 추적
let prevPos = await prisma.position.findFirst({  // 최초 1회만 DB 조회
  where: { vesselId: id, suspicious: false, timestamp: { lt: firstTimestamp } },
  orderBy: { timestamp: "desc" },
  select: { lat: true, lon: true, timestamp: true },
});

for (const r of sorted) {
  const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);
  const position = await prisma.position.upsert(...);
  if (!suspicious) prevPos = { lat, lon, timestamp }; // 메모리에서 갱신
}
```

**개선 효과**: N번 findFirst → 1번 findFirst. 180 레코드 기준 DB 왕복 **180회 감소**. O(N) DB 호출 → O(1).

**트레이드오프**: 없음. sorted 배열이 시간순으로 보장되므로 정확도 동일.

---

#### 3. [datalasticPoller.js:149-153] — 카테고리: N+1 쿼리 (스푸핑 탐지)

**문제**: `pollPositions()`에서 선박당 `position.findFirst`를 개별 호출한다. `forceUpdate`도 동일. 선박 30척이면 폴링 1회에 30번 별도 SELECT.

**영향**: 30척 기준 폴링 1회 = 추가 30 DB 왕복. 고빈도가 아닌 폴링(하루 6회)이라 절대적 영향은 적으나, 선박 추가 시 선형 증가.

**최적화 코드**:
```js
// 폴링 시작 전 선박들의 최신 위치를 1번의 쿼리로 일괄 조회
const vesselIds = vessels.map(v => v.id);
const latestPositions = await prisma.position.findMany({
  where: {
    vesselId: { in: vesselIds },
    suspicious: false,
  },
  orderBy: { timestamp: 'desc' },
  distinct: ['vesselId'],
  select: { vesselId: true, lat: true, lon: true, timestamp: true },
});
const prevPosMap = new Map(latestPositions.map(p => [p.vesselId, p]));

// 루프 내
const prevPos = prevPosMap.get(v.id) || null;
```

**개선 효과**: N번 findFirst → 1번 findMany. 30척 기준 DB 왕복 **29회 감소**. O(N) → O(1) DB 호출.

**트레이드오프**: `distinct` + `orderBy` 조합이 DB에 따라 풀스캔 발생 가능. `@@index([vesselId, timestamp(sort: Desc)])` 인덱스(schema에 존재)가 적용되므로 문제 없음.

---

### 🟡 권장 최적화

---

#### 1. [App.jsx:332-336] — 카테고리: React 불필요한 객체 생성

**문제**: WS `position` 메시지 수신마다 `setPositions`가 전체 positions 객체를 새로 생성하고 해당 선박의 배열도 새 배열로 교체한다. 선박 30척 × 하루 6회 폴링 = 180번 전체 `positions` 객체 재생성 (실사용 영향은 낮으나 패턴 자체가 비효율적).

**현재 코드**:
```js
setPositions((prev) => ({
  ...prev,                                           // 전체 객체 spread
  [vesselId]: [msg.data, ...(prev[vesselId] || [])].slice(0, 2000),  // 새 배열
}));
```

**최적화 코드**: 현재 구조 자체는 React 불변성 원칙에 맞으며 선박 수가 적은 경우 실제 병목은 아니다. 다만 선박이 50척 이상이 되면 Map 기반 상태 관리나 useReducer 패턴으로 전환을 검토한다.

**개선 효과**: 선박 50척 미만 현 규모에서는 영향 미미. 100척 이상 시 리렌더 최적화 필요.

---

#### 2. [App.jsx:359-373] — 카테고리: 불필요한 폴링

**문제**: `/api/health`를 10초마다 폴링하여 WebSocket 연결 상태를 확인한다. WS 자체의 `onclose`/`onerror` 이벤트가 이미 연결 단절을 감지하므로 health 폴링은 중복이다.

**영향**: 10초마다 HTTP 요청 1건 = 하루 8,640건 불필요한 API 호출. 인증 미들웨어가 매 요청마다 `authenticate()` → DB 조회(캐시 hit 시 Map.get) 수행.

**최적화 코드**:
```js
// useWebSocket에서 연결 상태를 반환하도록 확장
export function useWebSocket(url, onMessage) {
  const [connected, setConnected] = useState(false);
  // ws.onopen → setConnected(true), ws.onclose → setConnected(false)
  return { connected };
}
// App.jsx: setWsConnected를 useWebSocket 반환값으로 대체, health 폴링 제거
```

**개선 효과**: 하루 8,640번 HTTP 왕복 제거. 연결 감지 레이턴시도 최대 10초 → 즉시로 단축.

---

#### 3. [Map/index.jsx:10-68] — 카테고리: 복잡도 (라벨 배치 알고리즘)

**문제**: `computeDynamicOffsets()`가 매 렌더마다 실행되며 O(N²) 충돌 검사를 수행한다 (N=선박 수). 외부 `useMemo` 없이 컴포넌트 함수 본문에서 직접 호출되지는 않지만, Map 컴포넌트가 리렌더될 때마다 재실행된다.

**영향**: 선박 30척: 30×30 = 900회 거리 계산, 선박 50척: 2,500회. 지도 줌/팬 시 리렌더와 결합되면 가시적 지연 가능.

현재 코드는 Map 컴포넌트 내부에서 `computeDynamicOffsets`를 직접 호출하지 않고 있어 즉각적 병목은 아니지만, 향후 사용 시 `useMemo` 적용이 필수이다.

**최적화 코드**:
```js
const offsets = useMemo(
  () => computeDynamicOffsets(vessels, positions, zoom),
  [vessels, positions, zoom]
);
```

**개선 효과**: vessels/positions/zoom이 변하지 않으면 재계산 없음. 잦은 리렌더 시 효과 큼.

---

#### 4. [geofenceChecker.js:112-126] — 카테고리: 공간 인덱스 부재

**문제**: `checkPoint()`가 모든 zone을 순회하며 bbox 필터 후 ray casting을 실행한다. bbox 필터는 있지만 공간 인덱스(R-Tree 등)가 없어 zone 수가 많을수록 O(Z) 선형 탐색이다.

**영향**: 현재 3개 GeoJSON 파일에서 로드되는 총 zone 수에 따라 다름. war-risk-zone-global.geojson의 경우 전 세계 구역을 포함하면 수백 개 가능. 선박 N척 × zone Z개 = N×Z 검사. 선박 30척, zone 200개 = 6,000회 bbox 검사/폴링.

**최적화 코드**:
```js
// 경도/위도 범위로 zone을 사전 버킷팅
class GeofenceChecker {
  buildSpatialIndex() {
    // 경도 범위를 10도 버킷으로 분할하여 O(Z/36) 평균 검색
    this.buckets = {};
    for (const zone of this.zones) {
      if (!zone.bbox) continue;
      const [x0,,x1] = zone.bbox;
      for (let b = Math.floor(x0/10)*10; b <= x1; b += 10) {
        (this.buckets[b] ??= []).push(zone);
      }
    }
  }
}
```

**개선 효과**: 평균 검색 zone 수 O(Z) → O(Z/36). zone 200개 기준 약 5~6개만 상세 검사.

**트레이드오프**: 코드 복잡도 증가. 현재 zone 수가 적다면 over-engineering. zone 파일 크기 확인 후 결정 권장.

---

#### 5. [accounts.js:6-27] — 카테고리: 캐시 갱신 지연

**문제**: 계정 캐시 TTL이 30초이며 비밀번호 변경 시 `clearAccountCache()`를 호출하나, 캐시 키가 비밀번호 값(plain text)이라 비밀번호 변경 후 구 비밀번호로 최대 0초(즉시 무효화) 접근은 차단된다. 다만 새 비밀번호는 캐시 무효화 직후 DB 재조회하므로 즉시 반영된다.

실제 문제는 **다중 프로세스/서버 환경**에서 `cachedAccounts`가 프로세스 메모리에만 존재한다는 것이다. PM2 cluster 모드로 확장 시 각 워커가 독립 캐시를 유지하므로 비밀번호 변경이 다른 워커에 반영되지 않는 최대 30초 지연 발생.

**영향**: 현재 단일 프로세스 운영 중이므로 실제 이슈 없음. 단, 수평 확장 시 인증 취약점.

---

### 🟢 참고 / 미래 고려

---

#### 1. [cleanup.js] — 클린업 쿼리 효율성

`position.deleteMany({ where: { timestamp: { lt: cutoff } } })`는 `@@index([vesselId, timestamp])` 복합 인덱스가 `timestamp` 단독 조건에 최적으로 활용되지 않을 수 있다. 단독 timestamp 인덱스 추가를 고려:
```prisma
@@index([timestamp])
```
단, 현재 소규모 데이터(30척 × 2000 레코드 = 60,000행)에서는 실측 영향 없음.

---

#### 2. [usePlayback.js:63-65] — 재생 시작 시 전체 배열 복사

`[...positions].sort(...)` 로 최대 2,000개 요소를 복사 후 정렬한다. 1회성 작업이고 sort는 O(N log N)이므로 2,000개 기준 약 22,000 비교 연산으로 허용 범위. 단, positions가 이미 `desc` 정렬된 상태라면 `Array.prototype.reverse()`가 O(N)으로 더 효율적이다.

---

#### 3. [wsServer.js:32-44] — broadcast 루프

클라이언트 수가 증가하면 `broadcast()`/`broadcastToAccount()`의 직렬 for 루프가 병목이 될 수 있다. 현재 동시 접속자 수가 적어 문제없으나, 50명 이상 동시 접속 시 Map 기반 클라이언트 관리와 account별 Set 분리를 고려한다.

---

## 복잡도 분석

| 함수 | 시간 복잡도 | 공간 복잡도 | 호출 빈도 | 우선순위 |
|------|-----------|-----------|----------|---------|
| `pollPositions()` | O(N × 3) DB + O(N) API — 순차 | O(N) | 하루 6회 | 🔴 |
| `forceUpdate()` | O(N × 3) DB + O(N) API — 순차 | O(N) | 수동 (간헐) | 🔴 |
| `POST /history` 루프 | O(M × 2) DB — M=레코드수 | O(M) | 수동 (간헐) | 🔴 |
| `computeDynamicOffsets()` | O(N²) 충돌 검사 | O(N) | 미사용(잠재적) | 🟡 |
| `checkPoint()` | O(Z) zone 순회 + bbox | O(1) | 폴링당 N회 | 🟡 |
| `loadPositions()` in App.jsx | O(N) 병렬 fetch | O(N) | 초기 로드 + trackHours 변경 | 🟢 |
| `usePlayback sort` | O(N log N) — N≤2000 | O(N) | 재생 시작 시 1회 | 🟢 |
| `cleanup()` | O(rows deleted) | O(1) | 하루 1회 | 🟢 |

---

## N+1 쿼리 분석

| 위치 | 루프 내 쿼리 | 예상 쿼리 수 (N=선박 수) | 개선 방법 |
|------|-----------|-----------|----------|
| `pollPositions()` L149 | `position.findFirst` (스푸핑 탐지) | N번 | 루프 전 `findMany + distinct`로 일괄 조회 |
| `forceUpdate()` L255 | `position.findFirst` (동일) | N번 | 동일 |
| `POST /history` L299 | `position.findFirst` (시간순 정렬된 루프 내) | M번 (레코드 수) | 이전 레코드 변수 추적으로 제거 |
| `fetchVesselInfo()` L81 | `apiCall + vessel.update` 순차 | N번 (API 호출) | 초기화 1회성이라 우선순위 낮음 |
| `geofenceChecker.initState()` L139 | `position.findFirst` per vessel | N번 | `findMany + distinct`로 일괄 조회 |

---

## 캐싱 기회

| 위치 | 반복 대상 | 캐시 전략 | 예상 효과 |
|------|---------|----------|----------|
| `accounts.js` | DB 계정 조회 | 현재 30초 TTL 존재 (적절) | — |
| `geofenceChecker.zones` | GeoJSON 파싱 | 이미 서버 시작 시 1회 메모리 로드 (적절) | — |
| `geofenceChecker.vesselZoneState` | zone 상태 | 이미 in-memory Map (적절) | — |
| `pollPositions` prevPos 조회 | 각 선박 최신 위치 | 루프 전 일괄 조회 후 Map 캐시 | DB 왕복 N-1회 감소 |
| `/api/vessels` GET | 선박 목록 | 짧은 TTL 캐시(5초) 추가 가능 | health 폴링 폐지 후 불필요 |

---

## 프로파일링 권고

| 대상 | 도구 | 이유 |
|------|------|------|
| `pollPositions` 전체 실행 시간 | `console.time` 래핑 또는 Node.js `--prof` | 선박 수 증가 시 실제 지연 측정 필요 |
| PostgreSQL 쿼리 실행 계획 | `EXPLAIN ANALYZE` on position.findFirst | `@@index([vesselId, timestamp(sort: Desc)])` 실제 활용 여부 확인 |
| `checkPoint()` zone 검사 수 | 카운터 로깅 삽입 | war-risk-zone-global.geojson zone 수에 따라 공간 인덱스 필요성 결정 |
| React 리렌더 빈도 | React DevTools Profiler | positions 상태 갱신 시 하위 컴포넌트 불필요한 리렌더 여부 확인 |
