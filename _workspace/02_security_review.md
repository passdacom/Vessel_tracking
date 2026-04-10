# 보안 리뷰 — Vessel Tracking App

## 리뷰 개요
- **보안 수준 평가**: 🔴 취약
- **리뷰 일자**: 2026-04-09
- **분석 범위**: `backend/src/`, `frontend/src/`
- **총 발견 수**: Critical 2 / High 3 / Medium 3 / Low 2

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
