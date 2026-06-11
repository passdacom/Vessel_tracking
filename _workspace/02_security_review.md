# 보안 리뷰 — Vessel Tracking App

## 리뷰 개요
- **보안 수준 평가**: 🔴 취약
- **리뷰 일자**: 2026-04-19 (최초: 2026-04-09 / 추가 검토: lanes.js, LaneEditor.jsx, LaneList.jsx)
- **분석 범위**: `backend/src/`, `frontend/src/`
- **총 발견 수**: Critical 2 / High 3 / Medium 3 / Low 2 + **신규(lanes 모듈): High 2 / Medium 3 / Low 2**

---

## 신규 취약점 — ShippingLanes 모듈 (lanes.js / LaneEditor.jsx / LaneList.jsx)

> 분석 대상:
> - `/root/.openclaw/workspace/Vessel_tracking/backend/src/routes/lanes.js`
> - `/root/.openclaw/workspace/Vessel_tracking/frontend/src/components/ShippingLanes/LaneEditor.jsx`
> - `/root/.openclaw/workspace/Vessel_tracking/frontend/src/components/ShippingLanes/LaneList.jsx`

---

### FINDING-L1 [lanes.js:65 / index.js:133] — A01 접근 제어 오류 (CWE-284)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `lanes.js:65`, `index.js:133` |
| **CWE** | CWE-284 Improper Access Control |
| **위험도** | **High** |

**설명**

`adminGuard`는 `router.use(adminGuard)` 호출로 등록되는데, 이 구문은 `lanes.js:65` 줄에 있다.
반면 `GET /:id` 라우트는 `lanes.js:51`에 미리 등록된다.
Express 라우터는 **미들웨어/라우트를 등록 순서대로** 실행하므로, `adminGuard` 이전에 매칭된
`GET /:id`는 adminGuard를 **전혀 거치지 않는다**.

단, `index.js:112~127`의 **전역 인증 미들웨어**(Bearer 토큰 검증)가 `/api/lanes` 전체 경로에 먼저 적용되므로 **완전히 비인증 접근이 허용되지는 않는다**. 그러나 일반 `user` 역할 계정으로 `GET /api/lanes/:id`에 접근하면 **admin 전용 라우트임에도 adminGuard 없이 응답**한다. 이는 의도된 설계(GET은 인증 사용자 전체 허용)인지 여부가 불명확하고, 향후 GET 핸들러에 민감 필드가 추가될 때 무방비 노출 위험이 있다.

**공격 시나리오**

일반 `user` 계정 소지자가 `GET /api/lanes/1`을 호출하면 `adminGuard`를 우회하고 항로 상세 정보(`coordinates`, `createdBy` 등)를 조회할 수 있다. 코드 주석("모든 인증 사용자")과 라우터 구조가 의도와 일치하더라도, 나중에 핸들러 내부에서 admin 체크를 시도하는 개발자가 이미 미들웨어 수준에서 보호된다고 오해할 수 있다.

**현재 코드**

```js
// lanes.js — 순서 문제
router.get("/:id", ...);      // line 51: adminGuard 이전 등록
router.use(adminGuard);       // line 65: 이 이후에만 adminGuard 적용됨
router.post("/", ...);
router.put("/:id", ...);
router.delete("/:id", ...);
```

**해결책**

라우터 구조를 명시적으로 분리하거나, 라우트별 의도를 주석으로 명확히 표시한다.
특히 GET 라우트가 실제로 "모든 인증 사용자"에게 허용됨이 맞다면 코드 주석을 유지하되,
`adminGuard` 구문 위에 명확한 경계 주석을 추가한다.
나중에 GET에도 admin 제한이 필요해지면 라우트 핸들러에 직접 `adminGuard`를 인수로 넘긴다.

```js
// 방법 A: 명시적 미들웨어 인수 (권장)
router.get("/",    optionalAuth, listLanesHandler);     // 전체: 인증 사용자
router.get("/:id", optionalAuth, getLaneHandler);       // 단일: 인증 사용자
router.post("/",   adminGuard,   createLaneHandler);    // 생성: admin only
router.put("/:id", adminGuard,   updateLaneHandler);    // 수정: admin only
router.delete("/:id", adminGuard, deleteLaneHandler);   // 삭제: admin only

// 방법 B: 서브 라우터 분리
const adminRouter = Router();
adminRouter.use(adminGuard);
adminRouter.post("/", ...);
adminRouter.put("/:id", ...);
adminRouter.delete("/:id", ...);
router.use(adminRouter);
```

---

### FINDING-L2 [lanes.js:13-29] — A04 안전하지 않은 설계 (CWE-400)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `lanes.js:13-29` |
| **CWE** | CWE-400 Uncontrolled Resource Consumption |
| **위험도** | **High** |

**설명**

`validateCoordinates()` 함수가 좌표 배열의 **상한(max length)을 검사하지 않는다**.
`coords.length < 2` 하한만 체크하므로, 공격자(admin 권한 보유자 포함)가
수십~수백만 개의 좌표를 포함한 페이로드를 전송하면:

1. `for ... of` 루프가 메모리 + CPU를 과점유하여 **Node.js 이벤트 루프 블로킹** 발생
2. Prisma가 JSON 필드에 거대한 배열을 그대로 저장 → **DB 디스크 폭증**
3. 응답 직렬화 시 수MB~수GB JSON 생성 → **메모리 OOM**

이는 "신뢰된 사용자도 실수할 수 있다"는 원칙상, admin 계정이 손상되거나 실수로 대용량 데이터를 전송하는 시나리오에서 서비스 전체가 중단될 수 있다.

**공격 시나리오**

```bash
# 100만 포인트 좌표 배열 POST
python3 -c "
import json, requests
coords = [[float(i%360-180), float(i%180-90)] for i in range(1_000_000)]
payload = {'name': 'attack', 'coordinates': coords, 'color': '#ff0000'}
r = requests.post('http://target/api/lanes',
    headers={'Authorization': 'Bearer ADMIN_TOKEN'},
    json=payload)
print(r.status_code)
"
```

Node.js 프로세스가 단일 요청으로 수 GB 메모리를 소비하며 다른 모든 요청이 중단된다.

**현재 코드**

```js
function validateCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {  // 하한만 존재
    return "coordinates는 2개 이상의 포인트 배열이어야 합니다";
  }
  // 상한 없음 — 무제한 처리
  for (const pt of coords) { ... }
}
```

**해결책**

```js
const MAX_WAYPOINTS = 500; // 항로 웨이포인트 실용 상한

function validateCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    return "coordinates는 2개 이상의 포인트 배열이어야 합니다";
  }
  if (coords.length > MAX_WAYPOINTS) {
    return `좌표는 최대 ${MAX_WAYPOINTS}개까지 허용됩니다`;
  }
  for (const pt of coords) { ... }
}
```

추가로 `express.json()` 미들웨어에 `limit` 옵션을 설정한다:

```js
// index.js
app.use(express.json({ limit: "1mb" }));  // 기본값 100kb, 명시적으로 상한 설정
```

---

### FINDING-L3 [LaneEditor.jsx:18] — A03 인젝션 / XSS (CWE-79)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `LaneEditor.jsx:18` |
| **CWE** | CWE-79 Improper Neutralization of Input During Web Page Generation (XSS) |
| **위험도** | **Medium** |

**설명**

`makeWpIcon()` 함수가 `color` 파라미터를 검증 없이 `L.divIcon`의 `html` 문자열에 직접 보간한다.

```js
// LaneEditor.jsx:18 — color가 그대로 CSS 인라인 속성에 삽입됨
html: `<div style="...background:${bg};...cursor:${cursor};..."></div>`,
```

`bg`는 `color` 또는 하드코딩된 `#ef4444`이고, `cursor`는 `mode`에서 파생된 세 값 중 하나다.
`color`는 `useState(initialLane?.color || "#f59e0b")`로 초기화되며, 서버 DB에서 읽어온 값이다.

**공격 시나리오**

lanes.js 서버 측에서는 색상 값을 `POST /api/lanes` 생성 시 `/^#[0-9a-fA-F]{6}$/` 정규식으로 검증한다. 그러나 **`PUT /api/lanes/:id` 수정 시에도 동일한 검증이 적용**되는지 확인한다(lanes.js:122 — 동일하게 적용됨). 따라서 현재는 서버 측 검증이 올바르게 작동하여 DB에 악성 color 값이 저장될 가능성은 낮다.

그러나 다음 조건이 겹치면 실제 XSS로 발전 가능하다:

1. **서버 측 검증 우회**: DB 직접 조작, Prisma 마이그레이션 오류, 또는 미래 코드 변경으로 검증 제거
2. **프론트엔드 무검증 신뢰**: `initialLane.color` 값을 서버에서 받은 즉시 `divIcon html`에 삽입

악성 color 값 예시:
```
#ff0000;} </style><script>alert(document.cookie)</script><style>{color:red
```
이 값이 `background:${bg}` 위치에 삽입되면 `<div style>` 컨텍스트 탈출 후 `<script>` 실행이 이론상 가능하다. 단, 현대 브라우저의 **`style` 속성 내 `<script>` 삽입은 대부분 실행되지 않는다**. 더 현실적인 벡터는 CSS 속성 주입으로 클릭재킹 오버레이 생성이다:

```
red; position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999
```

**현재 코드**

```js
function makeWpIcon(color, mode) {
  const bg = isDelete ? "#ef4444" : color;  // color 미검증
  return L.divIcon({
    html: `<div style="...background:${bg}..."></div>`,  // 직접 보간
  });
}
```

**해결책**

프론트엔드에서도 색상 값을 사용하기 전에 형식 검증을 추가한다:

```js
// 색상 값 정제 함수 추가
function sanitizeColor(val) {
  return /^#[0-9a-fA-F]{6}$/.test(val) ? val : "#f59e0b";
}

function makeWpIcon(color, mode) {
  const safeColor = sanitizeColor(color);
  const bg = isDelete ? "#ef4444" : safeColor;
  // ...
}
```

또는 CSS 변수 방식으로 인라인 보간 자체를 제거한다:

```js
// divIcon에 data 속성만 전달, CSS에서 처리
html: `<div class="wp-icon" data-mode="${mode}"></div>`,
// CSS: .wp-icon { background: var(--wp-color, #f59e0b); }
```

---

### FINDING-L4 [lanes.js:43 / LaneList.jsx:182] — A01 데이터 노출 (CWE-200)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `lanes.js:43`, `LaneList.jsx:182` |
| **CWE** | CWE-200 Exposure of Sensitive Information to Unauthorized Actor |
| **위험도** | **Medium** |

**설명**

`GET /api/lanes` 및 `GET /api/lanes/:id` 응답이 `prisma.shippingLane.findMany()` / `findUnique()`의
**전체 필드**를 그대로 직렬화하여 반환한다. 이 중 `createdBy` 필드는 생성자의 계정명을 포함한다.

`LaneList.jsx:182`에서 이 값을 UI에 직접 렌더링한다:

```jsx
<span className="flex-shrink-0">{createdAt} by {lane.createdBy}</span>
```

또한 `coordinates` 필드 전체(항로의 모든 웨이포인트 좌표)가 비admin 사용자에게도 노출된다.
내부 운영 정보(항로 운항 패턴, 기항지 등)가 의도치 않게 노출될 수 있다.

**해결책**

```js
// lanes.js — 응답 필드 화이트리스트 적용
const lanes = await prisma.shippingLane.findMany({
  where,
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    name: true,
    description: true,
    color: true,
    active: true,
    coordinates: true,
    createdAt: true,
    // createdBy: admin 역할일 때만 포함
  },
});
// 또는 응답 전 필드 제거:
const sanitized = lanes.map(({ createdBy, ...rest }) =>
  req.accountRole === "admin" ? { createdBy, ...rest } : rest
);
res.json(sanitized);
```

---

### FINDING-L5 [lanes.js:37] — A01 접근 제어 오류 (CWE-285)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `lanes.js:37` |
| **CWE** | CWE-285 Improper Authorization |
| **위험도** | **Medium** |

**설명**

`GET /api/lanes?active=all` 파라미터가 `req.query.active === "all"` 조건으로 처리되어,
`where` 절에서 `active` 필터를 제거하고 **비활성(숨김) 항로도 포함한 전체 목록을 반환**한다.

이 엔드포인트는 `adminGuard` 이전에 등록되어 있어, **일반 user 역할 계정도 비활성 항로를 조회**할 수 있다.

```js
// lanes.js:37-38
const showAll = req.query.active === "all";
const where = showAll ? {} : { active: true };
```

비활성 항로는 운영자가 "숨김" 처리한 데이터이므로, admin에게만 접근을 제한하는 것이 적절하다.

**해결책**

```js
// active=all은 admin에게만 허용
const showAll = req.query.active === "all" && req.accountRole === "admin";
const where = showAll ? {} : { active: true };
```

---

### FINDING-L6 [LaneEditor.jsx:142] — A04 안전하지 않은 설계 (CWE-400)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `LaneEditor.jsx:142` |
| **CWE** | CWE-400 Uncontrolled Resource Consumption |
| **위험도** | **Medium** |

**설명**

항적 가져오기 시 `hours=2160`(90일치)로 위치 데이터를 전부 요청한다.
`simplifyAdaptive()` 함수가 클라이언트에서 실행되어 좌표를 20~30개로 줄이지만,
**서버로부터 수만 개의 위치 레코드를 먼저 받아와야** 하는 구조다.

위치 데이터가 90일 × 6회/일 = 540 레코드라면 문제없지만, 선박이 고빈도 AIS 수신으로
수만 개의 포지션을 가질 경우 클라이언트 메모리와 파싱 시간이 폭증한다.

또한 `simplifyAdaptive()`의 while 루프는 `tolerance < 10` 조건으로 최대 반복 횟수를 간접적으로 제한하지만,
입력 배열이 매우 클 경우(수십만 포인트) turf.js 내부 처리 시간이 브라우저 메인 스레드를 블로킹한다.

**해결책**

서버 측에서 미리 샘플링하거나 페이지네이션을 적용한다:

```js
// vessels.js: 위치 조회 시 max limit 추가
router.get("/:id/positions", async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours) || 24, 2160);
  const limit = Math.min(parseInt(req.query.limit) || 1000, 5000); // 상한 설정
  // ...
});
```

---

### FINDING-L7 [LaneList.jsx:57] — A04 안전하지 않은 설계 (CWE-352 참고)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `LaneList.jsx:57` |
| **CWE** | CWE-352 Cross-Site Request Forgery (참고 수준) |
| **위험도** | **Low** |

**설명**

`handleDelete()`가 `window.confirm()`으로만 이중 확인을 수행한다. CSRF 토큰이 없고,
Bearer 토큰 인증이 적용되어 있어 실제 CSRF 위험은 낮다.
그러나 XSS가 발생하면 `window.confirm`을 우회하고(`window.confirm = () => true`) 즉시 삭제 API를 호출할 수 있다.

**해결책**

UI 레이어의 삭제 확인은 현재 수준으로 적절하다. XSS 방어(FINDING-L3)를 우선 처리한다.

---

### FINDING-L8 [lanes.js:95 / lanes.js:145] — A09 로깅 부족 (CWE-778)

| 항목 | 내용 |
|------|------|
| **파일:라인** | `lanes.js:95`, `lanes.js:145`, `lanes.js:164` |
| **CWE** | CWE-778 Insufficient Logging |
| **위험도** | **Low** |

**설명**

항로 생성/수정/삭제 로그(`logger.info`)는 존재하나, **실패한 인증 시도**(adminGuard에서 403 반환)가 로깅되지 않는다. 일반 user가 POST/PUT/DELETE를 반복 시도하는 권한 상승 시도를 탐지할 수 없다.

**해결책**

```js
function adminGuard(req, res, next) {
  if (req.accountRole !== "admin") {
    logger.warn(`[lanes] adminGuard denied: ${req.account} (${req.method} ${req.path})`);
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
```

---

## 신규 취약점 요약표 (lanes 모듈)

| # | 파일:라인 | CWE | 설명 | 위험도 | 해결책 요약 |
|---|----------|-----|------|--------|------------|
| L1 | `lanes.js:51,65` | CWE-284 | adminGuard 순서 — GET /:id가 adminGuard 우회 | **High** | 라우트별 명시적 미들웨어 인수 방식으로 변경 |
| L2 | `lanes.js:13-29` | CWE-400 | 좌표 배열 상한 없음 → DoS | **High** | `MAX_WAYPOINTS=500` 상한 추가, `express.json({limit:"1mb"})` |
| L3 | `LaneEditor.jsx:18` | CWE-79 | `color` 미검증 divIcon html 보간 → CSS/XSS 주입 | **Medium** | `sanitizeColor()` 검증 함수, 또는 data-attribute 방식 전환 |
| L4 | `lanes.js:43`, `LaneList.jsx:182` | CWE-200 | `createdBy` 등 내부 필드 비admin에게 노출 | **Medium** | Prisma `select` 화이트리스트 / role별 필드 필터링 |
| L5 | `lanes.js:37` | CWE-285 | `?active=all` 비admin도 비활성 항로 조회 가능 | **Medium** | `showAll` 조건에 `req.accountRole === "admin"` 추가 |
| L6 | `LaneEditor.jsx:142` | CWE-400 | 90일 항적 전체 클라이언트 처리 → 브라우저 블로킹 | **Medium** | 서버 측 위치 데이터 limit 파라미터 추가 |
| L7 | `LaneList.jsx:57` | CWE-352 | window.confirm만으로 삭제 확인 — XSS 시 우회 가능 | **Low** | XSS 방어(L3) 우선 처리 |
| L8 | `lanes.js:95,145,164` | CWE-778 | adminGuard 거부 이벤트 미로깅 | **Low** | adminGuard 내 `logger.warn` 추가 |

---

## 취약점 발견 사항

### 🔴 Critical

---

#### 1. [accounts.js:17 / App.jsx:151] — A02 암호화 실패 (CWE-256, CWE-312)

- **취약점**: 비밀번호가 해시 없이 평문으로 DB에 저장되고, 평문 그대로 `localStorage`에 보관된다. Map 조회키도 평문 비밀번호이므로 비교 자체가 해시 없이 이루어진다.
- **공격 시나리오**:
  SQLite `dev.db` 파일에 읽기 권한을 얻은 공격자(서버 디렉터리 노출, 백업 탈취 등)가
  `SELECT password FROM Account` 한 번으로 모든 계정 자격증명을 평문으로 획득할 수 있다.
  또한 XSS 취약점이 발생할 경우 `localStorage.getItem('vessel_auth')` 호출 한 줄로
  세션 중인 사용자의 비밀번호를 즉시 탈취할 수 있다.
- **현재 코드**:
  ```js
  // accounts.js:17 — 비밀번호를 Map 키로 직접 사용
  cachedAccounts.set(row.password, { name: row.name, role: row.role });

  // App.jsx:151 — localStorage에 평문 저장
  localStorage.setItem("vessel_auth", pw);
  ```
- **안전한 코드**:
  ```js
  // 1. DB 저장 시 bcrypt 해시 적용
  import bcrypt from 'bcrypt';
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.account.update({ where: { name }, data: { password: hash } });

  // 2. 인증 시 비교
  const isMatch = await bcrypt.compare(inputPassword, row.passwordHash);
  if (!isMatch) return null;

  // 3. localStorage에는 서명된 세션 토큰만 저장 (비밀번호 아님)
  localStorage.setItem("vessel_session_token", jwtToken);
  ```
- **CVSS**: 7.5 (네트워크 불필요, 낮은 복잡도, 높은 기밀성 영향) / **악용 난이도**: 낮음

---

#### 2. [App.jsx:325 / wsServer.js:11] — A02 암호화 실패 + A07 인증 실패 (CWE-319, CWE-522)

- **취약점**: WebSocket 연결 URL의 쿼리 파라미터에 비밀번호(= Bearer 토큰)가 평문으로 노출된다. HTTP 요청과 달리 WS URL은 서버 액세스 로그, 브라우저 히스토리, 네트워크 프록시에 전부 기록된다.
- **공격 시나리오**:
  HTTP(비-TLS) 환경에서 동일 네트워크의 공격자가 패킷 캡처로 `?token=PASSWORD` 값을 획득하면
  즉시 API Bearer 토큰으로 재사용해 모든 인증된 엔드포인트에 접근할 수 있다.
  TLS 환경에서도 서버 접근 로그(`/var/log/nginx/access.log`)에 비밀번호가 평문으로 남는다.
- **현재 코드**:
  ```js
  // App.jsx:325
  const wsUrl = `${proto}//${wsHost}/ws?token=${encodeURIComponent(wsToken)}`;
  // wsToken = localStorage.getItem("vessel_auth") = 평문 비밀번호
  ```
- **안전한 코드**:
  ```js
  // 연결 후 첫 메시지로 토큰 전송 (URL에 노출 없음)
  const ws = new WebSocket(`${proto}//${wsHost}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: sessionToken }));

  // wsServer.js: 연결 직후 인증 메시지 대기
  wss.on('connection', (ws, req) => {
    let authenticated = false;
    ws.once('message', async (raw) => {
      const { type, token } = JSON.parse(raw);
      if (type !== 'auth') { ws.close(1008, 'Unauthorized'); return; }
      const account = await authenticate(prisma, token);
      if (!account) { ws.close(1008, 'Unauthorized'); return; }
      authenticated = true;
      clients.set(ws, account);
    });
    setTimeout(() => { if (!authenticated) ws.close(1008, 'Timeout'); }, 5000);
  });
  ```
- **CVSS**: 8.1 (네트워크 벡터, 낮은 복잡도) / **악용 난이도**: 낮음

---

### 🟠 High

---

#### 3. [index.js:21] — A05 보안 설정 오류 (CWE-942)

- **취약점**: CORS 설정이 `origin: true`로 되어 있어 요청의 Origin 헤더를 그대로 허용한다. 모든 출처에서의 자격증명 포함 요청이 가능해진다.
- **공격 시나리오**:
  악성 웹사이트에서 `fetch('https://vessel-app/api/vessels', { credentials: 'include' })`를
  실행하면 브라우저가 피해자의 쿠키와 함께 요청을 전송한다.
  현재는 쿠키 기반 인증이 아니지만, 세션 쿠키 도입 시 CSRF 공격 벡터가 된다.
  `credentials: false`이지만 `origin: true`는 불필요한 공격 면을 넓힌다.
- **현재 코드**:
  ```js
  app.use(cors({ origin: true, credentials: false }));
  ```
- **안전한 코드**:
  ```js
  const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
      else cb(new Error('Not allowed by CORS'));
    },
    credentials: false,
  }));
  ```
- **CVSS**: 6.5 / **악용 난이도**: 중간

---

#### 4. [index.js:79] — A01 접근 제어 취약점 (CWE-284)

- **취약점**: 인증 미들웨어에서 `/api/shares/view/`로 시작하는 경로를 prefix 문자열 비교로 인증 면제한다. 경로 조작 공격이 가능하며, 비인증 상태에서 `/api/shares/view/../vessels`처럼 다른 엔드포인트에 접근하는 우회 시나리오가 존재한다.
- **공격 시나리오**:
  Express 라우팅 정규화에 따라 `/api/shares/view/../../admin/accounts`와 같은 경로가
  정규화된 후 `/api/admin/accounts`로 라우팅될 경우, 인증 없이 관리자 전용 엔드포인트에
  접근할 수 있다. Express 기본 설정에서 `..` 경로는 정규화되지만, 미들웨어 레벨의
  `startsWith` 체크는 정규화 전 원시 경로 기준으로 실행되므로 불일치가 발생할 수 있다.
- **현재 코드**:
  ```js
  // index.js:79 — 원시 경로 prefix 비교
  if (req.path.startsWith("/api/shares/view/")) return next();
  ```
- **안전한 코드**:
  ```js
  // 정확한 패턴 매칭 사용
  const PUBLIC_SHARE_PATTERN = /^\/api\/shares\/view\/[A-Za-z0-9_-]{12,}$/;
  if (PUBLIC_SHARE_PATTERN.test(req.path)) return next();
  // 또는 shares 라우터에서 해당 경로만 미들웨어 없이 먼저 등록
  ```
- **CVSS**: 7.2 / **악용 난이도**: 중간

---

#### 5. [accounts.js:30 / index.js:84] — A07 인증 실패 (CWE-291)

- **취약점**: Bearer 토큰이 비밀번호 그 자체다. 세션 토큰과 자격증명의 역할이 합쳐져 있어, 토큰 탈취 = 자격증명 탈취가 된다. 또한 비밀번호 변경 후에도 기존에 탈취된 토큰이 즉시 무효화되지 않는다 (캐시 30초 TTL 동안 유효).
- **공격 시나리오**:
  네트워크 로그에서 `Authorization: Bearer PASSWORD` 헤더를 확보한 공격자가
  비밀번호를 알게 됨과 동시에 API 접근 토큰도 확보한다.
  비밀번호 변경 직후 30초간 구 비밀번호로 인증이 성공한다.
- **안전한 코드 방향**:
  로그인 시 무작위 세션 토큰(JWT 또는 `crypto.randomBytes(32).toString('hex')`) 발급 →
  DB의 `sessions` 테이블에 저장 → 비밀번호 변경 시 해당 계정의 모든 세션 즉시 삭제.

---

### 🟡 Medium

---

#### 6. [index.js:24-34] — A05 보안 설정 오류 (CWE-400)

- **취약점**: Rate limit이 `/api/force-update`(5회/15분)와 `/api/vessels/:id/history`(10회/15분)에만 적용된다. 인증 엔드포인트(`/api/auth`)에 rate limit이 없어 비밀번호 브루트포스가 무제한으로 가능하다.
- **공격 시나리오**:
  공격자가 `/api/auth`에 자동화 스크립트로 초당 수백 회 요청을 전송하면
  짧은 비밀번호(현재 최소 4자)를 수 초 내에 무차별 대입으로 크랙할 수 있다.
- **안전한 코드**:
  ```js
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { error: "Too many login attempts" },
    skipSuccessfulRequests: true,  // 성공한 요청은 카운트 제외
  });
  app.use("/api/auth", authLimiter);
  ```
- **CVSS**: 5.3 / **악용 난이도**: 낮음

---

#### 7. [index.js:51, admin.js:169] — A04 안전하지 않은 설계 (CWE-521)

- **취약점**: 비밀번호 최소 길이가 4자로 설정되어 있다. 기업 보안 요구사항 기준에서 매우 약하며, 브루트포스에 취약하다.
- **안전한 코드**:
  ```js
  if (!newPassword || newPassword.length < 12) {
    return res.status(400).json({ error: "비밀번호는 12자 이상이어야 합니다" });
  }
  // 추가: 영문+숫자+특수문자 조합 강제
  if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
    return res.status(400).json({ error: "영문과 숫자를 포함해야 합니다" });
  }
  ```
- **CVSS**: 4.3 / **악용 난이도**: 낮음 (Rate limit 부재와 결합 시 Critical)

---

#### 8. [admin.js:50-57] — A03 인젝션 (CWE-89, 참고 수준)

- **취약점**: `$queryRaw` 템플릿 리터럴을 사용하지만, `thirtyDaysAgo` 파라미터는 Prisma가 자동으로 파라미터 바인딩하므로 SQL 인젝션 위험은 없다. 단, 미래에 문자열 연결 방식(`$queryRawUnsafe`)으로 변경될 경우 위험하다.
- **현재 코드**:
  ```js
  // admin.js:50 — Prisma $queryRaw 태그드 템플릿 (안전)
  const dailyRaw = await prisma.$queryRaw`
    SELECT DATE("createdAt") as date, SUM(credits) as total
    FROM "ApiUsage" WHERE "createdAt" >= ${thirtyDaysAgo}
    ...
  `;
  ```
- **권고**: `$queryRaw` 태그드 템플릿 문법 유지 필수. `$queryRawUnsafe` 사용 금지를 코드 리뷰 체크리스트에 명시한다.
- **CVSS**: 0.0 (현재 안전) / **악용 난이도**: 해당 없음

---

### 🟢 Low / Informational

---

#### 9. [index.js:153-158] — A05 보안 설정 오류 (CWE-798)

- **취약점**: 초기 계정 시드가 `ACCOUNTS=admin:password,user:pass` 환경변수 형태로 이루어진다. 배포 스크립트나 CI/CD 로그에 평문 자격증명이 노출될 가능성이 있다.
- **권고**: 초기 시드는 별도 시크릿 관리 도구(Vault, AWS SSM Parameter Store) 또는 최초 실행 시 랜덤 비밀번호를 생성하고 콘솔에 1회 출력하는 방식으로 변경한다.

---

#### 10. [shares.js:47-76] — A09 로깅 실패 (CWE-778)

- **취약점**: 공개 공유 링크(`/api/shares/view/:token`) 접근에 대한 로깅이 없다. 토큰 무차별 대입 시도를 탐지할 수 없다.
- **권고**:
  ```js
  router.get("/view/:token", async (req, res) => {
    console.log(`[shares] view attempt token=${req.params.token} ip=${req.ip}`);
    // ... 기존 로직
  });
  ```
  아울러 공유 링크에도 별도 rate limit을 적용한다.

---

## OWASP Top 10 매핑

| 카테고리 | 상태 | 발견 수 | 비고 |
|---------|------|--------|------|
| A01 접근 제어 | ⚠️ | 1 | shares/view/ prefix 우회 가능성 |
| A02 암호화 | ❌ | 2 | 비밀번호 평문 저장, WS URL 크리덴셜 노출 |
| A03 인젝션 | ✅ | 0 | Prisma ORM 사용, $queryRaw 안전하게 사용 중 |
| A04 안전하지 않은 설계 | ⚠️ | 1 | 비밀번호 최소 길이 4자 |
| A05 보안 설정 오류 | ❌ | 3 | CORS wildcard, rate limit 누락, 환경변수 자격증명 |
| A06 취약한 컴포넌트 | ✅ | 0 | 최신 버전 사용 중 (2024 기준) |
| A07 인증 실패 | ❌ | 2 | 토큰=비밀번호, 세션 무효화 없음 |
| A08 데이터 무결성 | ✅ | 0 | 이상 없음 |
| A09 로깅 부족 | ⚠️ | 1 | 공유 링크 접근 비감사 |
| A10 SSRF | ✅ | 0 | 외부 API 호출은 고정 도메인 (datalastic.com) |

---

## 의존성 취약점

의존성 파일 분석 결과 아래 패키지들은 2024년 기준 최신 버전을 사용하고 있어 알려진 고위험 CVE 없음.

| 패키지 | 사용 버전 | 상태 | 비고 |
|--------|----------|------|------|
| express | ^4.18.2 | ✅ | 4.19+ 권장 (경미한 패치 반영) |
| ws | ^8.16.0 | ✅ | 최신 |
| @prisma/client | ^5.9.1 | ✅ | 최신 |
| leaflet | ^1.9.4 | ✅ | 최신 안정 |
| tokml | ^0.4.0 | ⚠️ | 마지막 배포 2016년. 유지보수 중단 상태. XSS 위험 가능성 있음 (KML 생성 시 사용자 입력 포함 여부 확인 필요) |

---

## 보안 강화 권고

### 즉시 조치 (Critical/High)

1. **비밀번호 해싱 도입**: `bcrypt` (cost factor 12 이상) 또는 `argon2id`로 모든 비밀번호를 해시하여 저장한다. 기존 평문 비밀번호는 마이그레이션 스크립트로 일괄 변환한다.

2. **세션 토큰 분리**: 로그인 성공 시 `crypto.randomBytes(32).toString('hex')` 또는 JWT로 세션 토큰을 발급한다. localStorage에는 세션 토큰만 저장하며 비밀번호는 저장하지 않는다. Bearer 토큰은 세션 토큰을 사용한다.

3. **WS 인증 방식 변경**: URL 쿼리 파라미터 방식 폐기 → 연결 후 첫 메시지로 토큰 전송하는 방식으로 전환한다.

4. **CORS 화이트리스트**: `origin: true` 대신 허용 도메인 목록을 환경변수로 명시 관리한다.

### 단기 조치 (Medium)

5. **인증 엔드포인트 Rate Limit**: `/api/auth`에 IP 기준 rate limit(10회/15분) 적용.

6. **비밀번호 정책 강화**: 최소 12자, 영문+숫자 조합 강제.

7. **shares/view 경로 정규화**: prefix 비교 대신 정규식 패턴 매칭 사용.

### 장기 개선

8. **HTTPS 강제**: Nginx에서 HTTP→HTTPS 리다이렉트 설정. WS도 `wss://` 전용으로 전환.

9. **보안 헤더 추가**: `helmet` 미들웨어로 `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` 헤더 적용.

10. **감사 로그**: 로그인 시도(성공/실패), 비밀번호 변경, 선박 추가/삭제 이벤트를 구조화된 형태로 기록한다.
