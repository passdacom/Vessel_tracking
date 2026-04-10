# 코드 스타일 리뷰

## 리뷰 개요
- **대상 언어**: JavaScript (Node.js/Express 백엔드 + React 18 프론트엔드)
- **적용 스타일 가이드**: Airbnb JavaScript Style Guide, React 공식 가이드
- **파일 수**: 13 (백엔드) + 25 (프론트엔드) = 38개
- **총 발견 수**: 🔴 4 / 🟡 9 / 🟢 6

---

## 발견 사항

### 🔴 필수 수정

**1. [datalasticPoller.js:116–196 / 200–308] — 코드 중복 (핵심)**

`pollPositions()`와 `forceUpdate()` 내부 루프 본문이 90% 동일하다. API 호출 → 좌표 파싱 → 스푸핑 탐지 → upsert → geofence 검사 → onPosition 브로드캐스트까지 동일한 30줄 블록이 두 곳에 복사되어 있다. 한쪽을 수정하면 다른 쪽도 반드시 수정해야 하고, 실제로 변수명(`prevPos` vs `prevPosF`, `suspicious` vs `susp`, `impliedSpeed` vs `ispd`, `reason` vs `sreason`)이 이미 불일치하는 상태다.

- 현재:
  ```js
  // pollPositions 내부
  const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, ...);

  // forceUpdate 내부 (동일 로직, 다른 변수명)
  const { suspicious: susp, impliedSpeed: ispd, reason: sreason } = checkSpoofing(prevPosF, ...);
  ```
- 제안:
  ```js
  // 공통 함수로 추출
  async function processVesselData(prisma, v, d, logger, onPosition, onZoneEvent) {
    const lat = parseFloat(d.lat);
    const lon = parseFloat(d.lon);
    if (!lat && !lon) return null;

    const cog = parseFloat(d.course) || null;
    const sog = parseFloat(d.speed) || null;
    const heading = d.heading != null && d.heading !== 511 ? parseInt(d.heading) : null;
    const navStatus = d.navigation_status || null;
    const destination = d.destination || null;
    const eta = d.eta_UTC ? new Date(d.eta_UTC) : null;
    const timestamp = d.last_position_epoch ? new Date(d.last_position_epoch * 1000) : new Date();

    if (d.name && !v.name) {
      await prisma.vessel.update({ where: { id: v.id }, data: { name: d.name } });
    }

    const prevPos = await prisma.position.findFirst({
      where: { vesselId: v.id, suspicious: false },
      orderBy: { timestamp: 'desc' },
      select: { lat: true, lon: true, timestamp: true },
    });
    const { suspicious, impliedSpeed, reason } = checkSpoofing(prevPos, lat, lon, timestamp);

    if (suspicious && logger) logger(`[Spoofing] ⚠ ${v.mmsi} 스푸핑 의심: ${reason}`);

    const position = await prisma.position.upsert({
      where: { vesselId_timestamp: { vesselId: v.id, timestamp } },
      create: { vesselId: v.id, lat, lon, cog, sog, heading, navStatus, destination, eta, timestamp, suspicious, impliedSpeed, spoofReason: reason },
      update: {},
    });

    if (!suspicious) {
      const zoneEvents = await geofenceChecker.detectAndSave(prisma, v, position).catch(() => []);
      if (zoneEvents.length > 0 && onZoneEvent) {
        for (const ev of zoneEvents) onZoneEvent({ ...ev, vesselName: d.name || v.alias || v.name || v.mmsi, account: v.account });
      }
      const currentZones = geofenceChecker.getCurrentZones(v.id);
      onPosition({ vesselId: v.id, mmsi: v.mmsi, name: d.name || v.name || v.alias, ...position, currentZones });
    }

    return position;
  }
  ```
- 이유: 중복 코드는 버그 유발의 가장 큰 원인이며, 이미 변수명 불일치(`susp`/`suspicious`, `ispd`/`impliedSpeed`)로 혼란이 발생하고 있다.
- 자동 수정: 불가 (ESLint `no-duplicate-code` 규칙으로 감지는 가능)

---

**2. [App.jsx:151] — 보안: 평문 비밀번호 localStorage 저장**

- 현재:
  ```js
  localStorage.setItem("vessel_auth", pw);
  ```
- 제안:
  ```js
  // Bearer 토큰 방식: 서버 로그인 응답에서 서명된 토큰 발급 후 저장
  // 단기 대안: 비밀번호 대신 서버가 반환하는 세션 ID를 저장
  ```
- 이유: `vessel_auth` 키에 평문 비밀번호가 저장되며, 이 값이 그대로 WebSocket URL 쿼리 파라미터(`?token=`)로 전달된다(`wsUrl` 구성 참고). 네트워크 로그, 브라우저 히스토리, 서버 액세스 로그에 비밀번호가 노출된다.
- 자동 수정: 불가

---

**3. [datalasticPoller.js:133] — 좌표 0,0 처리 버그**

- 현재:
  ```js
  if (!lat && !lon) continue;
  ```
- 제안:
  ```js
  if (isNaN(lat) || isNaN(lon)) continue;
  ```
- 이유: `parseFloat("0")` 은 `0`이고, `!0`은 `true`다. 위도 0 또는 경도 0은 유효한 좌표(적도/본초 자오선)이지만 이 조건으로 인해 건너뛰어진다. `forceUpdate` 내 동일한 라인(236)도 같은 문제를 가진다.
- 자동 수정: 불가

---

**4. [accounts.js:17] — 보안: 평문 비밀번호를 Map 키로 캐싱**

- 현재:
  ```js
  cachedAccounts.set(row.password, { name: row.name, role: row.role });
  ```
- 제안: 서버 측에서 bcrypt 해시 비교 방식으로 전환. 단기 대안으로 캐시를 비밀번호 → 계정 매핑 대신 계정명 → 해시 매핑으로 변경.
- 이유: 인메모리에 모든 계정의 평문 비밀번호가 상주한다. 메모리 덤프, 디버거 연결 등으로 전체 계정 자격증명이 노출될 수 있다.
- 자동 수정: 불가

---

### 🟡 권장 수정

**1. [datalasticPoller.js:84] — 에러 핸들링: 빈 catch 블록 남용**

- 현재:
  ```js
  try { await prisma.apiUsage.create({ ... }); } catch {}
  ```
- 제안:
  ```js
  try {
    await prisma.apiUsage.create({ data: { endpoint: "vessel_info", credits: 1, account: null } });
  } catch (e) {
    console.warn("[Datalastic] apiUsage 기록 실패:", e.message);
  }
  ```
- 이유: 완전히 빈 catch 블록은 DB 연결 오류, 스키마 불일치 등 실제 문제를 조용히 삼킨다. 최소한 warn 로깅이 있어야 디버깅이 가능하다. `pollPositions`, `forceUpdate`, `vessels.js` 등 여러 곳에서 동일 패턴이 반복된다.
- 자동 수정: ESLint `no-empty` 규칙 (단, catch 블록은 `allowEmptyCatch` 옵션 비활성화 필요)

---

**2. [App.jsx:460–472] — 함수 배치 순서 비일관성**

`handleSidebarResize`가 조건부 반환(`if (!isAuthed)`, `if (accountRole === "admin")`) 이후에 선언되어 있다. React 컴포넌트에서 훅이 아닌 일반 함수는 일관된 위치(상단 또는 하단)에 몰아두는 것이 관례다. 이 함수는 다른 핸들러들과 달리 JSX 반환문 바로 위에 위치해 흐름을 끊는다.

---

**3. [App.jsx:565] — 한 줄에 지나치게 긴 JSX 속성 (가독성)**

- 현재:
  ```jsx
  <AddVesselModal ... customGroups={[...new Set([...customGroups, ...vessels.map(v => v.companyType).filter(Boolean)])].filter(g => g !== '자사간사' && g !== '타사간사')} ... />
  ```
- 제안: 인라인 계산 로직을 `useMemo` 또는 변수로 분리.
  ```js
  const availableCustomGroups = useMemo(() =>
    [...new Set([...customGroups, ...vessels.map(v => v.companyType).filter(Boolean)])]
      .filter(g => g !== '자사간사' && g !== '타사간사'),
    [customGroups, vessels]
  );
  ```
- 자동 수정: Prettier (줄 길이 제한 적용 시 강제 줄바꿈)

---

**4. [index.js:25, 30] — 매직 넘버: rate limit 설정**

- 현재:
  ```js
  windowMs: 15 * 60 * 1000, max: 5
  windowMs: 15 * 60 * 1000, max: 10
  ```
- 제안:
  ```js
  const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
  const FORCE_UPDATE_MAX_REQUESTS = 5;
  const HISTORY_MAX_REQUESTS = 10;
  ```
- 이유: 동일한 window 값이 두 곳에 반복되며, 수정 시 모두 찾아야 한다.
- 자동 수정: ESLint `no-magic-numbers`

---

**5. [App.jsx:43] — 매직 넘버: stale 판단 시간**

- 현재:
  ```js
  const stale = !pos || Date.now() - new Date(pos.timestamp) > 2 * 60 * 60 * 1000;
  ```
  동일한 `2 * 60 * 60 * 1000` 리터럴이 `Sidebar/index.jsx:58`에도 반복된다.
- 제안: 공유 상수 파일(`constants.js`)에 `STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000` 정의.
- 자동 수정: ESLint `no-magic-numbers`

---

**6. [wsServer.js:33] — `broadcast` 메서드의 WebSocket.OPEN 하드코딩**

- 현재:
  ```js
  if (client.readyState === 1) client.send(msg);
  ```
- 제안:
  ```js
  if (client.readyState === WebSocket.OPEN) client.send(msg);
  ```
- 이유: `1`은 `WebSocket.OPEN` 상수다. 명시적 상수 사용이 의도를 명확히 한다. `broadcastToAccount`도 동일 패턴.
- 자동 수정: 불가

---

**7. [admin.js:74] — 매직 넘버: API 크레딧 한도**

- 현재:
  ```js
  monthlyLimit: 20000,
  monthlyRemaining: Math.max(0, 20000 - totalUsed),
  ```
- 제안:
  ```js
  const MONTHLY_API_LIMIT = parseInt(process.env.API_MONTHLY_LIMIT || "20000", 10);
  ```
- 이유: 같은 `20000` 값이 두 줄에 사용되며 환경에 따라 다를 수 있는 설정이다.

---

**8. [Map/index.jsx:1–68] — `computeDynamicOffsets` 함수가 컴포넌트 파일에 위치**

지도 레이블 배치 알고리즘(약 60줄)이 React 컴포넌트 파일에 직접 포함되어 있다. 순수 계산 함수이므로 별도 유틸 파일(`utils/labelOffsets.js`)로 분리하면 테스트 가능성과 가독성이 향상된다.

---

**9. [geofenceChecker.js:55–63] — `computeBbox`의 중첩 함수 `visit`**

재귀 함수 `visit`이 `computeBbox` 내부에 선언되어 있다. 외부에서 재사용 가능한 로직이 아니므로 구조 자체는 문제없으나, 함수 내부 `if/else` 분기에 중괄호가 없어 가독성이 떨어진다.

- 현재:
  ```js
  if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
  ```
- 제안: 각 조건에 줄바꿈 또는 중괄호 추가.
- 자동 수정: Prettier

---

### 🟢 참고 사항

**1. [datalasticPoller.js:315] — cron 표현식 주석**

`// UTC 시간 기준` 주석이 코드 바로 옆에 있어 실제 KST 시간과의 관계를 명시한다. 잘 된 부분이나, 주석이 코드 라인과 같은 줄에 있어 길이가 길다. 별도 줄로 분리하면 더 읽기 좋다.

**2. [vessels.js:28–32] — `logApiUsage` 헬퍼 함수 분리**

API 사용량 기록 로직이 `logApiUsage`로 명확히 분리되어 있다. 단일 책임 원칙을 잘 따른 패턴이다.

**3. [Sidebar/index.jsx] — 상수(`TRACK_QUICK`, `TRACK_ALL`)를 컴포넌트 외부로 분리**

트랙 시간 옵션 상수를 모듈 최상단에 배치한 것은 불필요한 리렌더링을 방지하는 올바른 패턴이다.

**4. [cleanup.js] — 파일 전체**

`THIRTY_DAYS_MS`, `INTERVAL_MS` 상수로 매직 넘버를 제거하고, 함수가 간결하게 단일 책임을 수행한다. 프로젝트 내 가장 깔끔하게 작성된 파일이다.

**5. [geofenceChecker.js] — JSDoc 주석 품질**

`checkSpoofing`, `detectAndSave`, `initState` 등 주요 함수에 JSDoc 형태의 주석이 잘 달려 있다.

**6. [vessels.js:5–41] — 헬퍼 함수 상단 배치**

`parseId`, `validatePositionFields`, `logApiUsage`, `checkVesselAccess`가 라우터 정의 전 상단에 몰려 있어 파일 구조를 파악하기 쉽다.

---

## 반복 패턴

| 패턴 | 발생 위치 | 발생 횟수 | 자동 수정 | 권장 규칙 |
|------|----------|---------|----------|----------|
| 빈 catch 블록 | datalasticPoller.js, vessels.js, Sidebar/index.jsx | 6+ | 부분 (ESLint) | `no-empty` (`allowEmptyCatch: false`) |
| 매직 넘버 (`2 * 60 * 60 * 1000`) | App.jsx, Sidebar/index.jsx | 2 | ESLint | `no-magic-numbers` |
| 매직 넘버 (`20000`, `15 * 60 * 1000`) | admin.js, index.js | 3 | ESLint | `no-magic-numbers` |
| `readyState === 1` 하드코딩 | wsServer.js | 2 | 불가 | 코드 리뷰 체크리스트 |
| `!lat && !lon` 좌표 0 버그 | datalasticPoller.js | 2 | 불가 | 단위 테스트 |
| 인라인 복잡 표현식 (JSX props) | App.jsx | 2 | Prettier | `max-len: 100` |

---

## 자동화 권장 설정

### .eslintrc.cjs (백엔드/프론트 공통)
```js
module.exports = {
  rules: {
    "no-empty": ["error", { "allowEmptyCatch": false }],
    "no-magic-numbers": ["warn", {
      "ignore": [0, 1, -1, 2, 10, 100],
      "ignoreArrayIndexes": true,
      "enforceConst": true
    }],
    "max-len": ["warn", { "code": 120, "ignoreStrings": true, "ignoreTemplateLiterals": true }],
    "no-unused-vars": "error",
  }
};
```

### .prettierrc
```json
{
  "printWidth": 100,
  "singleQuote": false,
  "semi": true,
  "trailingComma": "es5",
  "tabWidth": 2
}
```

---

## 칭찬할 점

1. **`cleanup.js`**: 상수명이 명확하고(`THIRTY_DAYS_MS`, `INTERVAL_MS`), 함수가 단일 책임을 깔끔하게 수행한다. 프로젝트 내 가장 이상적인 스타일로 작성된 파일이다.

2. **`vessels.js`의 헬퍼 함수 분리**: `parseId`, `validatePositionFields`, `logApiUsage`, `checkVesselAccess` 4개의 유틸 함수를 라우터 상단에 명시적으로 분리하여, 라우터 핸들러 자체가 비즈니스 로직에만 집중한다. 단일 책임 원칙을 잘 따른 구조다.

3. **`geofenceChecker.js`의 알고리즘 구현**: Ray Casting 기반 포인트-인-폴리곤 구현이 바운딩 박스 사전 필터(`bbox`)와 함께 성능 최적화까지 고려되어 있다. 외부 의존성 없이 구현한 점도 배포 안정성에 기여한다.
