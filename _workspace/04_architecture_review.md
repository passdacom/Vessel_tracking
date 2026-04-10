# 아키텍처 리뷰 — Vessel Tracking App

## 리뷰 개요

- **아키텍처 건강 수준**: 🟡 개선 필요
- **아키텍처 패턴**: Layered (Express Routes → Services → Prisma ORM) + React 단일 컴포넌트 트리
- **총 발견 수**: 🔴 4 / 🟡 6 / 🟢 3

---

## 구조적 발견 사항

### 🔴 구조적 문제

#### 1. `Vessel.mmsi @unique` — 다계정 선박 공유 불가 [데이터 모델 / DIP 위반]

**문제**: `schema.prisma`의 `Vessel` 모델에 `mmsi String @unique` 제약이 있다. 한 계정이 MMSI `123456789`를 등록하면 다른 계정은 동일 선박을 등록할 수 없다. `vessels.js` POST 라우트에서 P2002 에러로 409를 반환하는 코드가 이를 증명한다. 현재 `account` 필드가 `Vessel`에 직접 박혀 있어 "선박은 한 계정에만 속한다"는 암묵적 가정이 스키마에 고정되어 있다.

**영향**: 새 계정을 추가할 때마다 이미 추적 중인 선박을 재등록할 수 없다. KB가 등록한 선박을 KDGC도 보고 싶다면 현재 구조로는 불가능하다. `datalasticPoller.js`는 `prisma.vessel.findMany({ where: { active: true } })`로 전체 선박을 폴링하므로, 중복 등록이 허용된다면 동일 MMSI를 두 번 API 호출하는 문제도 발생한다.

**리팩토링 제안 — 옵션 A: 복합 unique (최소 변경)**

```
// 현재
model Vessel {
  mmsi    String @unique
  account String @default("kb")
}

// 변경 후: (account, mmsi) 복합 unique
model Vessel {
  mmsi    String
  account String @default("kb")
  @@unique([account, mmsi])
}
```

이 방식은 마이그레이션이 단순하고 폴링 중복 방지 로직을 폴러에서 처리해야 한다는 점에서 현재 구조에 가장 잘 맞는다. 폴러는 `mmsi`로 중복 제거한 유니크 목록만 API 호출하면 된다.

**리팩토링 제안 — 옵션 B: VesselAccount 중간 테이블 (장기 권장)**

```
model Vessel {
  id           Int              @id @default(autoincrement())
  mmsi         String           @unique   // 선박 자체는 글로벌 unique 유지
  name         String?
  // ... 선박 물리 정보 필드들
  accounts     VesselAccount[]
  positions    Position[]
  zoneEvents   ZoneEvent[]
}

model VesselAccount {
  id          Int     @id @default(autoincrement())
  vesselId    Int
  vessel      Vessel  @relation(fields: [vesselId], references: [id], onDelete: Cascade)
  account     String
  alias       String?
  color       String  @default("#3b82f6")
  companyType String  @default("자사간사")
  active      Boolean @default(true)
  createdAt   DateTime @default(now())
  @@unique([vesselId, account])
  @@index([account])
}
```

이 구조에서 선박 물리 정보(IMO, 톤수, 제원 등)는 `Vessel`에 한 번만 저장되고, 계정별 표시 설정(alias, color, companyType, active)은 `VesselAccount`에 저장된다. 폴러는 전체 `Vessel`에서 active인 것을 MMSI 기준으로 한 번만 호출하고, 결과를 해당 선박을 구독하는 모든 계정에 브로드캐스트한다.

**단계**:
1. 스키마 변경 + 마이그레이션 (옵션 A는 1단계로 완료 가능)
2. 폴러의 `pollPositions`에 MMSI dedup 로직 추가
3. `vessels.js` POST에서 P2002 처리 방식 변경 (옵션 B의 경우 이미 등록된 선박을 계정에 연결하는 로직)
4. `wsServer.broadcastToAccount`를 VesselAccount 기반으로 확장
5. 프론트엔드 `vessel_removed` 이벤트: 다른 계정이 아직 사용 중인지 확인

---

#### 2. `App.jsx` God Component — SRP 위반 [프론트엔드 아키텍처]

**문제**: `App.jsx`는 609줄로 다음 책임을 모두 가지고 있다:
- 인증 상태 관리 및 localStorage 조작 (handleLogin, handleLogout, isAuthed 등 약 30줄)
- 선박 CRUD 비즈니스 로직 (handleAddVessel, handleDeleteVessel, handleArchiveVessel, handleRestoreVessel, handleUpdateVessel — 약 70줄)
- 그룹 관리 로직 (handleAddCustomGroup, handleRenameGroup, handleDeleteGroup — 약 50줄)
- 위치 데이터 로드 및 WebSocket 상태 동기화 (loadPositions, useWebSocket 콜백 — 약 70줄)
- UI 레이아웃 및 모달 오케스트레이션 (showAddModal, showSharePanel, showManualModal 등 8개 boolean 상태)
- 인쇄용 ReportTable 컴포넌트 정의 (65줄)
- ZoneToast 컴포넌트 정의 (22줄)
- 사이드바 리사이즈 핸들러 로직

**영향**: 어떤 기능을 수정해도 App.jsx를 열어야 한다. 새 모달을 추가할 때마다 boolean 상태 1개, 핸들러 1-2개, JSX 조건 렌더링 1개씩 App.jsx가 커진다. 테스트 작성 시 전체 App 트리를 마운트해야 한다.

**리팩토링 제안**:

```
frontend/src/
├── contexts/
│   └── AuthContext.jsx        // isAuthed, accountName, accountRole, handleLogin, handleLogout
├── hooks/
│   ├── useAuth.js             // localStorage 읽기/쓰기 캡슐화
│   ├── useVessels.js          // vessels, positions, loadPositions, CRUD 핸들러
│   ├── useGroups.js           // customGroups, handleAddCustomGroup, handleRenameGroup
│   └── useWebSocket.js        // (이미 존재, 유지)
├── components/
│   ├── App.jsx                // 레이아웃 조합만 (100줄 이하 목표)
│   ├── Map/                   // 현행 유지
│   ├── Sidebar/               // 현행 유지
│   └── print/
│       └── ReportTable.jsx    // 인쇄용 컴포넌트 분리
```

핵심은 `useAuth`와 `useVessels` 두 커스텀 훅을 만드는 것이다. `useAuth`는 localStorage 키 이름을 내부에서만 알고, `useVessels`는 apiFetch를 받아 선박 상태와 CRUD를 캡슐화한다.

**단계**:
1. `ReportTable`과 `ZoneToast`를 별도 파일로 분리 (영향 없는 단순 추출)
2. `useAuth.js` 훅 작성 — localStorage 접근을 한 곳으로 모음
3. `useVessels.js` 훅 작성 — vessels/positions 상태와 핸들러 이동
4. App.jsx를 조합 레이어로 축소

---

#### 3. `index.js` 서비스 하드 결합 + `app.locals` DI — DIP 위반 [서비스 레이어]

**문제**: `index.js`에서 `datalasticPoller`, `wsServer`, `geofenceChecker`가 직접 인스턴스화되어 서로의 콜백으로 결합되어 있다. `vessels.js` 라우트는 `req.app.locals.wsServer`와 `req.app.locals.poller`를 통해 이 서비스들에 접근한다. Express의 `app.locals`는 DI 컨테이너가 아니라 요청 컨텍스트 저장소이므로, 타입 안전성이 없고 테스트에서 모킹하려면 app 객체 전체를 조작해야 한다.

```javascript
// 현재: 라우트에서 암묵적 의존
req.app.locals.wsServer?.broadcastToAccount(...)
req.app.locals.poller?.forceUpdate(...)

// 개선: 라우트 팩토리에 명시적 DI
export default function vesselRoutes(prisma, { wsServer, poller }) {
  ...
  wsServer.broadcastToAccount(...)
  poller.forceUpdate(...)
}

// index.js에서 조합
app.use("/api/vessels", vesselRoutes(prisma, { wsServer, poller: datalasticPoller }));
```

**영향**: 현재 구조에서 `vessels.js`를 단위 테스트하려면 `req.app.locals`에 mock을 주입하는 복잡한 설정이 필요하다. 명시적 DI 방식으로 변경하면 `vesselRoutes(mockPrisma, { wsServer: mockWs, poller: mockPoller })`로 간단히 테스트할 수 있다.

---

#### 4. 폴링 로직 중복 — DRY 위반 [서비스 레이어]

**문제**: `datalasticPoller.js`의 `pollPositions` 함수와 `forceUpdate` 함수는 거의 동일한 로직을 가진다. API 호출, 위치 파싱, 스푸핑 감지, DB upsert, geofence 검사, onPosition 콜백 호출이 모두 두 곳에 중복된다. `pollPositions`는 약 80줄, `forceUpdate`의 핵심 루프는 약 90줄로 대부분 동일한 코드다.

**리팩토링 제안**:

```javascript
// 공통 로직을 내부 함수로 추출
async function processVessel(v, prisma, onPosition, onZoneEvent, logger) {
  const params = v.imo ? { imo: v.imo } : { mmsi: v.mmsi };
  const res = await apiCall("vessel", params);
  // ... 파싱, 스푸핑, upsert, geofence 공통 처리
}

// pollPositions와 forceUpdate는 대상 선박 목록만 결정하고 processVessel 호출
async function pollPositions() {
  const vessels = await prisma.vessel.findMany({ where: { active: true } });
  for (const v of vessels) await processVessel(v, prisma, onPosition, onZoneEvent, null);
}
```

---

### 🟡 설계 개선

#### 5. 구조화된 로깅 부재 [관찰 가능성]

**문제**: 전체 백엔드에서 `console.log` / `console.error` / `console.warn`만 사용한다. 로그 레벨 조정 불가, 파일 출력 불가, 구조화된 JSON 형식 없음, 요청 ID 추적 불가.

**개선 제안 — winston 기반 로거**:

```javascript
// backend/src/utils/logger.js
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new DailyRotateFile({
      filename: "logs/app-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",          // 20MB 초과 시 rotation
      maxFiles: "30d",         // 30일 보관
      zippedArchive: true,
    }),
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "10m",
      maxFiles: "30d",
    }),
  ],
});
```

설치: `npm install winston winston-daily-rotate-file`

`console.log` → `logger.info`, `console.error` → `logger.error`, `console.warn` → `logger.warn`으로 일괄 교체한다.

---

#### 6. `Account` 모델 기능 미완성 — vesselLimit, 폴링 스케줄 [데이터 모델]

**문제**: 계정별 선박 수 제한(`vesselLimit`)과 폴링 스케줄 설정이 없다. 현재 cron 표현식 `"0 4,6,8,11,15,23 * * *"`이 `datalasticPoller.js` 소스코드에 하드코딩되어 있다. 계정 생성/삭제 API 엔드포인트도 없다 (`admin.js`에는 비밀번호 변경만 있다).

**개선 제안 — 스키마 확장**:

```prisma
model Account {
  id           Int      @id @default(autoincrement())
  name         String   @unique
  password     String
  role         String   @default("user")
  vesselLimit  Int      @default(20)     // 계정별 선박 등록 한도
  createdAt    DateTime @default(now())
}

model SystemConfig {
  id        Int      @id @default(autoincrement())
  key       String   @unique             // e.g. "poll_cron"
  value     String                       // e.g. "0 4,6,8,11,15,23 * * *"
  updatedAt DateTime @updatedAt
}
```

폴러 초기화 시 `SystemConfig`에서 cron 표현식을 읽어오면 재배포 없이 스케줄 변경이 가능해진다.

**계정 CRUD API 추가** (`admin.js`):

```javascript
// POST /api/admin/accounts — 계정 생성
router.post("/accounts", async (req, res) => {
  const { name, password, role, vesselLimit } = req.body;
  // 유효성 검증 후
  const account = await prisma.account.create({
    data: { name, password, role: role || "user", vesselLimit: vesselLimit || 20 }
  });
  clearAccountCache();
  res.status(201).json({ id: account.id, name: account.name, role: account.role });
});

// DELETE /api/admin/accounts/:name — 계정 삭제
router.delete("/accounts/:name", async (req, res) => {
  // admin 계정은 삭제 불가 guard 필요
  await prisma.account.delete({ where: { name: req.params.name } });
  clearAccountCache();
  res.json({ success: true });
});
```

`vesselLimit` 체크는 `vessels.js` POST 라우트에서 `existingCount >= account.vesselLimit`로 추가한다.

---

#### 7. localStorage 인증 토큰 분산 [프론트엔드 / ISP]

**문제**: localStorage 키(`vessel_auth`, `vessel_auth_expires`, `vessel_account`, `vessel_role`, `vessel_sidebar_width`, `vessel_zone_settings`, `vessel_custom_groups`)에 대한 접근이 `App.jsx`의 여러 위치와 초기화 함수에 분산되어 있다. `wsUrl` 구성(`localStorage.getItem("vessel_auth")`)도 App.jsx 본문에 인라인으로 작성되어 있다. 또한 비밀번호 평문이 localStorage에 저장되어 Bearer 토큰으로 사용된다.

**개선 제안**:

```javascript
// frontend/src/utils/storage.js
const KEYS = {
  AUTH:    "vessel_auth",
  EXPIRES: "vessel_auth_expires",
  ACCOUNT: "vessel_account",
  ROLE:    "vessel_role",
};

export const storage = {
  getAuth: ()    => localStorage.getItem(KEYS.AUTH) || "",
  setAuth: (pw, account, role) => {
    localStorage.setItem(KEYS.AUTH, pw);
    localStorage.setItem(KEYS.EXPIRES, String(Date.now() + 86400000));
    localStorage.setItem(KEYS.ACCOUNT, account);
    localStorage.setItem(KEYS.ROLE, role);
  },
  clearAuth: () => Object.values(KEYS).forEach(k => localStorage.removeItem(k)),
  isValid: () => {
    const expires = localStorage.getItem(KEYS.EXPIRES);
    return expires && Date.now() < parseInt(expires, 10);
  },
};
```

---

#### 8. `geofenceChecker` 싱글턴 모듈 스코프 상태 [테스트 가능성]

**문제**: `geofenceChecker.js` 파일 말미에 `export const geofenceChecker = new GeofenceChecker()`로 싱글턴을 모듈 레벨에서 생성한다. `datalasticPoller.js`가 이 싱글턴을 직접 `import`해 사용하므로, 테스트에서 geofence 동작을 제어하려면 모듈 모킹이 필요하다. `vesselZoneState`가 메모리에 있어 서버 재시작 시 초기화되고, `initState`를 통해 DB에서 복원하는 설계는 적절하지만, 상태가 싱글턴에 갇혀 있어 멀티 인스턴스 배포(PM2 클러스터 모드)에서 문제가 된다.

**개선 제안**: 현재 규모에서 클러스터 모드는 불필요하므로 즉각적인 구조 변경보다는, `GeofenceChecker`를 `createDatalasticPoller`처럼 팩토리 함수로 변경하여 DI를 용이하게 하는 것을 권장한다.

---

#### 9. `admin.js`의 Raw SQL 사용 [데이터 접근 일관성]

**문제**: `admin.js` 36~57번 줄에서 일별 API 사용량 집계에 `prisma.$queryRaw`를 사용한다. 나머지 모든 쿼리는 Prisma ORM을 사용하므로 일관성이 없고, DB를 PostgreSQL 외 다른 것으로 바꿀 때 `DATE()` 함수 호환성 문제가 생길 수 있다.

**개선 제안**:

```javascript
// Raw SQL 대신 Prisma groupBy + createdAt 날짜 추출
const dailyRaw = await prisma.apiUsage.findMany({
  where: { createdAt: { gte: thirtyDaysAgo } },
  select: { createdAt: true, credits: true },
});
// JavaScript에서 날짜별 집계
const dailyMap = {};
for (const r of dailyRaw) {
  const date = r.createdAt.toISOString().slice(0, 10);
  dailyMap[date] = (dailyMap[date] || 0) + r.credits;
}
```

---

#### 10. `accounts.js` 비밀번호 평문 캐시 [보안 / 설계]

**문제**: `accounts.js`의 `loadAccounts`가 `Map<password, accountInfo>` 형태로 캐시한다. 비밀번호가 Map의 key이므로 메모리 덤프 시 모든 비밀번호가 노출된다. 30초 TTL은 변경 반영을 위한 것이지만 캐시 구조 자체가 문제다. 또한 인증이 단순 문자열 비교(`accounts.get(password)`)이므로 타이밍 공격에 취약하다.

**개선 제안**: 비밀번호는 bcrypt 해시로 저장하고, Map의 key를 `account.name`으로 변경한 후, 인증 시 `bcrypt.compare(inputPassword, stored.hash)`를 사용한다. 이는 `clearAccountCache` 필요성도 줄인다.

---

### 🟢 참고 사항

#### 11. Route Factory 패턴 적절히 적용됨

`vesselRoutes(prisma)`, `adminRoutes(prisma)`, `sharesRoutes(prisma)`, `portRoutes(prisma)` 모두 팩토리 함수로 prisma를 주입받는다. `app.locals` 우회 문제가 있지만, 기본 DI 방향은 올바르다.

#### 12. `useWebSocket` 훅의 재연결 로직

`useWebSocket.js`에서 `onMessageRef`를 통해 콜백 클로저 문제를 해결하고, 3초 재연결 로직을 깔끔하게 구현했다.

#### 13. `checkSpoofing` 순수 함수 추출

`datalasticPoller.js`에서 AIS 스푸핑 탐지 로직이 `checkSpoofing` 순수 함수로 분리되어 export되어 있다. `vessels.js`에서 히스토리 처리 시 재사용하고 있으며, 단위 테스트하기 좋은 구조다.

---

## SOLID 원칙 평가

| 원칙 | 상태 | 주요 위반 | 비고 |
|------|------|---------|------|
| S — SRP | ⚠️ | App.jsx (인증+CRUD+UI+레이아웃 혼재), datalasticPoller (폴링 로직 중복) | 백엔드 각 라우트 파일은 적절히 분리됨 |
| O — OCP | ⚠️ | 새 계정 추가 시 소스 코드(cron, 하드코딩 account 기본값) 수정 필요 | 라우트 구조는 OCP 잘 준수 |
| L — LSP | ✅ | 해당 없음 | 상속 구조가 거의 없어 위반 여지 없음 |
| I — ISP | ⚠️ | wsServer.broadcast vs broadcastToAccount: 호출부가 필요 없는 메서드에도 노출됨 | 현재 규모에서는 허용 수준 |
| D — DIP | ⚠️ | vessels.js → req.app.locals (암묵적 의존), geofenceChecker 싱글턴 직접 import | prisma DI는 잘 되어 있음 |

---

## 의존성 그래프

```
index.js
  ├── accounts.js (authenticate, clearAccountCache)
  ├── services/wsServer.js ← prisma, accounts.js
  ├── services/datalasticPoller.js ← prisma, geofenceChecker [직접 import — 결합]
  │     └── services/geofenceChecker.js (싱글턴)
  ├── services/cleanup.js ← prisma
  ├── routes/vessels.js ← prisma, datalasticPoller [apiCall, checkSpoofing export]
  │     └── (req.app.locals.wsServer, req.app.locals.poller — 암묵적 의존)
  ├── routes/admin.js ← prisma, accounts.js
  ├── routes/shares.js ← prisma
  └── routes/ports.js ← prisma

순환 참조: 없음
문제 의존: datalasticPoller → geofenceChecker (싱글턴 직접 결합)
           vessels.js → app.locals (암묵적 서비스 접근)
```

---

## 레이어 분석

| 레이어 | 모듈 | 관심사 | 의존 방향 | 상태 |
|--------|------|--------|----------|------|
| 진입점 | index.js | 서비스 조합, HTTP 서버 | 모든 서비스 참조 | ⚠️ 조합 책임은 맞으나 force-update 라우트가 인라인 정의됨 |
| 라우트 | routes/*.js | HTTP 요청/응답, 입력 검증 | prisma, app.locals | ⚠️ app.locals 의존이 레이어 경계를 모호하게 함 |
| 서비스 | services/*.js | 비즈니스 로직, 외부 API, WebSocket | prisma, 서비스 간 직접 참조 | 🟡 서비스 간 결합 존재 |
| 데이터 | prisma (ORM) | DB 접근 추상화 | DB | ✅ 적절 |
| 도메인 모델 | schema.prisma | 데이터 구조 | 없음 | ⚠️ Vessel에 account 직접 포함, 다계정 공유 불가 |

---

## 테스트 가능성 평가

| 모듈 | DI 지원 | 모킹 용이 | 부수효과 격리 | 점수 |
|------|--------|---------|-------------|------|
| routes/vessels.js | ⚠️ (prisma만, ws/poller는 app.locals) | 어려움 | ❌ app.locals 직접 접근 | 5/10 |
| routes/admin.js | ✅ (prisma DI) | 용이 | ✅ | 8/10 |
| services/datalasticPoller.js | ✅ (prisma, 콜백 DI) | 중간 (geofenceChecker 싱글턴) | ⚠️ | 6/10 |
| services/geofenceChecker.js | ❌ (싱글턴) | 어려움 | ❌ 모듈 레벨 상태 | 4/10 |
| accounts.js | ⚠️ (prisma 인수, 모듈 레벨 캐시) | 중간 | ⚠️ 모듈 레벨 캐시 | 6/10 |
| frontend/App.jsx | ❌ | 매우 어려움 (모든 상태 내부) | ❌ | 3/10 |
| frontend/useWebSocket.js | ✅ (url, onMessage 인수) | 용이 | ✅ | 9/10 |

---

## 설계 패턴 분석

| 패턴 | 적용 여부 | 적절성 | 비고 |
|------|---------|--------|------|
| Factory Function (라우트) | ✅ 적용 | 적절 | vesselRoutes(prisma) 등 |
| Observer/Callback (WebSocket 브로드캐스트) | ✅ 적용 | 적절 | onPosition, onVesselUpdate 콜백 |
| Singleton (geofenceChecker) | ✅ 적용 | 부분적으로 부적절 | 테스트 어려움, DI 불가 |
| Repository (Prisma) | ✅ 적용 (간접) | 적절 | ORM이 이 역할 수행 |
| Caching (accounts.js TTL 캐시) | ✅ 적용 | 구조 개선 여지 | password를 key로 사용 문제 |
| 다계정 공유 (중간 테이블) | ❌ 미적용 | 필요 | VesselAccount 테이블 필요 |
| Structured Logging | ❌ 미적용 | 필요 | console.* 만 사용 |

---

## 칭찬할 점

1. **라우트 팩토리 패턴**: 모든 라우트가 `prisma`를 팩토리 인수로 받아 데이터 접근 계층을 올바르게 주입받는다. Express 앱에서 흔히 보이는 전역 prisma 참조 패턴을 피한 것은 좋은 선택이다.

2. **WebSocket 계정 격리**: `wsServer.broadcastToAccount`가 계정명과 admin 역할을 확인하여 데이터 격리를 WebSocket 레벨에서도 시행한다. 단순히 HTTP 레이어에서만 인증하는 것에 비해 더 안전한 구조다.

3. **스푸핑 감지 순수 함수**: `checkSpoofing`이 외부 의존 없이 순수 함수로 추출되어 `datalasticPoller.js`와 `vessels.js` 양쪽에서 재사용된다. 도메인 로직을 서비스 구현과 분리한 올바른 방향이다.

4. **Geofence BBox 사전 필터**: `geofenceChecker.js`의 `checkPoint`에서 Bounding Box 사전 필터로 전체 영역 대비 ray casting 연산을 최소화한 성능 최적화가 잘 되어 있다.

5. **useWebSocket 재연결 + 클로저 문제 해결**: `onMessageRef`를 통해 React 클로저 이슈(stale closure)를 올바르게 처리하고, 3초 재연결 로직도 cleanup이 깔끔하다.

---

## 요청 기능 아키텍처 설계

### 기능 1: 로깅 시스템 (일자별 파일 분리 + Rotation)

**의존성 추가**:
```
npm install winston winston-daily-rotate-file
```

**파일 구조**:
```
backend/
├── src/
│   └── utils/
│       └── logger.js     // winston 인스턴스 export
└── logs/                 // .gitignore에 추가
    ├── app-2026-04-09.log
    ├── app-2026-04-09.log.1  (20MB 초과 시 분할)
    └── error-2026-04-09.log
```

**logger.js 설계**:
```javascript
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const fileFormat = combine(errors({ stack: true }), timestamp(), json());

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    // 콘솔 출력 (개발 환경)
    new winston.transports.Console({
      format: combine(colorize(), simple())
    }),
    // 전체 로그: 일자별 파일, 20MB 초과 시 .1, .2 분할, 30일 보관
    new DailyRotateFile({
      filename:       "logs/app-%DATE%.log",
      datePattern:    "YYYY-MM-DD",
      maxSize:        "20m",
      maxFiles:       "30d",
      zippedArchive:  true,
      format:         fileFormat,
    }),
    // 에러만 별도 파일
    new DailyRotateFile({
      filename:       "logs/error-%DATE%.log",
      datePattern:    "YYYY-MM-DD",
      level:          "error",
      maxSize:        "10m",
      maxFiles:       "30d",
      zippedArchive:  true,
      format:         fileFormat,
    }),
  ],
});
```

**마이그레이션**: `console.log` → `logger.info`, `console.error` → `logger.error`, `console.warn` → `logger.warn`. 구조화된 데이터를 두 번째 인수로 넘긴다:
```javascript
// 기존
console.log(`[Datalastic] ✅ ${v.mmsi} (${d.name}) | ${lat},${lon}`);
// 변경
logger.info("position_polled", { mmsi: v.mmsi, name: d.name, lat, lon });
```

---

### 기능 2: 계정 관리 확장 (생성/삭제, vesselLimit, 폴링 스케줄)

**스키마 변경**:
```prisma
model Account {
  id          Int      @id @default(autoincrement())
  name        String   @unique
  password    String
  role        String   @default("user")
  vesselLimit Int      @default(20)
  createdAt   DateTime @default(now())
}

model SystemConfig {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
}
```

**SystemConfig 초기 시드** (마이그레이션 또는 init에서):
```javascript
await prisma.systemConfig.upsert({
  where: { key: "poll_cron" },
  create: { key: "poll_cron", value: "0 4,6,8,11,15,23 * * *" },
  update: {},
});
```

**폴러 동적 스케줄 적용**:
```javascript
// datalasticPoller.js start()
async start() {
  const config = await prisma.systemConfig.findUnique({ where: { key: "poll_cron" } });
  const cronExpr = config?.value || "0 4,6,8,11,15,23 * * *";
  const task = cron.schedule(cronExpr, () => pollPositions());
  tasks.push(task);
}
```

**admin.js 신규 엔드포인트**:
```
POST   /api/admin/accounts              계정 생성 (name, password, role, vesselLimit)
DELETE /api/admin/accounts/:name        계정 삭제 (admin 계정은 삭제 불가)
PATCH  /api/admin/config/poll-cron      폴링 스케줄 변경 (cron 표현식 유효성 검증 후 저장)
```

`POST /api/vessels` 라우트에서 vesselLimit 체크 추가:
```javascript
const accountRow = await prisma.account.findUnique({ where: { name: account } });
const limit = accountRow?.vesselLimit ?? 20;
if (existingCount >= limit) {
  return res.status(403).json({ error: `선박 등록 한도(${limit}척)에 도달했습니다` });
}
```

---

### 기능 3: 다계정 선박 공유 + 폴링 중복 방지

**단기 해결책 (옵션 A — 최소 변경, 권장)**:

스키마:
```prisma
model Vessel {
  mmsi    String
  account String @default("kb")
  // ... 나머지 필드 동일
  @@unique([account, mmsi])   // @unique 제거, 복합 unique 추가
  @@index([account])
}
```

마이그레이션 주의: 기존 `@unique` 인덱스 drop → 복합 unique 인덱스 create. 기존 데이터에 (account, mmsi) 중복은 없으므로 무손실 마이그레이션 가능.

폴러 중복 방지:
```javascript
async function pollPositions() {
  const vessels = await prisma.vessel.findMany({ where: { active: true } });
  
  // MMSI 기준 중복 제거: 같은 MMSI는 한 번만 API 호출
  const mmsiMap = new Map(); // mmsi → vessel (첫 번째만 사용)
  for (const v of vessels) {
    if (!mmsiMap.has(v.mmsi)) mmsiMap.set(v.mmsi, v);
  }
  const uniqueVessels = Array.from(mmsiMap.values());
  
  for (const v of uniqueVessels) {
    const positionData = await fetchAndSavePosition(v);
    if (!positionData) continue;
    
    // 해당 MMSI를 추적하는 모든 계정에 브로드캐스트
    const allAccounts = vessels
      .filter(a => a.mmsi === v.mmsi)
      .map(a => a.account);
    
    for (const account of allAccounts) {
      onPosition({ ...positionData, account });
    }
  }
}
```

wsServer 변경: `broadcastToAccount`를 호출할 때 position data에 vesselId가 아니라 모든 관련 계정의 vesselId를 포함해야 하므로, 브로드캐스트 방식 조정이 필요하다.

**장기 해결책 (옵션 B — VesselAccount 테이블)**은 앞서 "구조적 문제 #1"에서 ERD를 제시했다. 옵션 B는 alias, color, companyType, active를 계정마다 독립적으로 설정할 수 있어 더 유연하지만, API 및 프론트엔드 변경 범위가 크다. 현재 사용 패턴(2-3개 계정, 수십 척 선박)에서는 옵션 A로 시작하고, 계정별 독립 설정 요구사항이 생기면 옵션 B로 전환하는 것을 권장한다.
