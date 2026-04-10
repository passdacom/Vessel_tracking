# 종합 코드 리뷰 보고서 — Vessel Tracking App

## 최종 판정

- **결과**: Request Changes
- **총평**: 기능 구현 품질은 전반적으로 양호하나, 평문 비밀번호 저장·전송 문제가 Critical 수준의 보안 위험으로 즉시 수정이 필요하다. 코드 중복(pollPositions/forceUpdate), N+1 쿼리, 스키마의 다계정 공유 불가 문제는 이번 릴리즈에서 해결해야 기능 확장이 용이해진다. 보안 Critical 이슈가 해소되면 Approve 가능한 수준이다.

---

## 통합 발견 사항 (우선순위순)

### P0 — 즉시 수정 (보안 Critical, 머지 차단)

#### P0-1. [accounts.js:17 / App.jsx:151] — 비밀번호 평문 저장 및 전송
- **영역**: 보안(Critical #1) + 스타일(필수 #4) + 아키텍처(설계 #10)
- **문제**: 비밀번호가 DB에 해시 없이 평문 저장되고, localStorage에 평문으로 보관된다. Map 조회 키도 평문 비밀번호이므로 DB 파일 탈취 1회로 모든 자격증명이 노출된다. XSS 발생 시 `localStorage.getItem('vessel_auth')` 한 줄로 비밀번호가 즉시 탈취된다.
- **수정 방향**:
  1. `bcrypt` (cost factor 12)로 비밀번호 해시 후 DB 저장
  2. accounts.js 캐시 구조를 `Map<name, {hash, role}>` 형태로 변경하고 `bcrypt.compare`로 인증
  3. 로그인 성공 시 `crypto.randomBytes(32).toString('hex')` 세션 토큰 발급 — localStorage에는 세션 토큰만 저장
- **예상 시간**: 3~4시간

#### P0-2. [App.jsx:325 / wsServer.js:11] — WebSocket URL 쿼리 파라미터에 비밀번호 노출
- **영역**: 보안(Critical #2)
- **문제**: `wss://host/ws?token=PLAIN_PASSWORD` 형태로 비밀번호가 URL에 노출된다. Nginx access.log, 브라우저 히스토리, 네트워크 프록시에 평문 비밀번호가 기록된다. (CVSS 8.1)
- **수정 방향**: WebSocket 연결 후 첫 메시지로 토큰 전송하는 방식으로 전환. P0-1의 세션 토큰 도입 후 함께 처리.
- **예상 시간**: P0-1과 묶어 처리 (추가 1시간)

#### P0-3. [datalasticPoller.js:133 / 236] — 좌표 0,0 처리 버그
- **영역**: 스타일(필수 #3)
- **문제**: `if (!lat && !lon) continue` — `parseFloat("0")`은 0이고 `!0`은 true다. 적도(위도 0) 또는 본초 자오선(경도 0)을 지나는 선박 위치가 유효하지 않은 데이터로 처리되어 폐기된다. pollPositions와 forceUpdate 두 곳 모두 해당.
- **수정 방향**: `if (isNaN(lat) || isNaN(lon)) continue`로 교체.
- **예상 시간**: 15분

---

### P1 — 이번 릴리즈 수정 (기능·구조적 문제)

#### P1-1. [datalasticPoller.js] — pollPositions/forceUpdate 코드 중복 + N+1 쿼리
- **영역**: 스타일(필수 #1) + 성능(필수 #1, #3) + 아키텍처(구조 #4)
- **문제**: 두 함수의 핵심 루프가 90% 중복. 이미 변수명 불일치(`suspicious`/`susp`, `impliedSpeed`/`ispd`)가 실제 발생 중. 선박당 `position.findFirst`를 개별 호출하여 N척이면 N번 직렬 DB 왕복. Datalastic API 호출도 순차 직렬이라 30척 기준 약 9초 소요.
- **수정 방향**:
  1. 공통 `processVessel(prisma, vessel, ...)` 내부 함수 추출
  2. 루프 전 `position.findMany({ distinct: ['vesselId'] })`로 이전 위치 일괄 조회 후 Map에 캐시
  3. `Promise.allSettled`로 API 호출 청크 병렬화 (CHUNK=5, rate-limit 확인 후 조정)
- **예상 효과**: 코드 중복 ~80줄 제거, DB 왕복 N-1회 감소, API 폴링 시간 약 5배 단축
- **예상 시간**: 2~3시간

#### P1-2. [vessels.js:292-322] — 히스토리 저장 N+1 쿼리
- **영역**: 성능(필수 #2)
- **문제**: `POST /vessels/:id/history` 에서 시간순 정렬된 레코드 루프 내에서 매 반복마다 `position.findFirst`를 호출한다. 180개 레코드 기준 DB 왕복 180회.
- **수정 방향**: 루프 전 최초 1회만 DB 조회하고, 이후 반복에서는 직전 레코드를 변수로 추적.
- **예상 시간**: 30분

#### P1-3. [index.js:79] — 인증 우회 경로 정규화 취약점
- **영역**: 보안(High #4)
- **문제**: `/api/shares/view/`에 대한 인증 면제를 `startsWith` 문자열 비교로 처리. Express 정규화 전 원시 경로 기준이라 경로 조작 우회 시도 여지가 있다.
- **수정 방향**: `const PUBLIC_SHARE_PATTERN = /^\/api\/shares\/view\/[A-Za-z0-9_-]{12,}$/` 정규식 매칭으로 교체.
- **예상 시간**: 15분

#### P1-4. [index.js:21] — CORS wildcard 설정
- **영역**: 보안(High #3)
- **문제**: `origin: true`로 모든 Origin을 허용. 세션 쿠키 도입 시 CSRF 공격 벡터가 된다. 현재도 불필요한 공격 면을 넓히고 있다.
- **수정 방향**: `ALLOWED_ORIGINS` 환경변수로 허용 도메인을 명시 관리.
- **예상 시간**: 30분

#### P1-5. [schema.prisma] — Vessel.mmsi @unique로 인한 다계정 선박 공유 불가
- **영역**: 아키텍처(구조 #1)
- **문제**: `mmsi @unique` 제약으로 한 계정이 등록한 선박을 다른 계정이 등록할 수 없다. KB와 KDGC가 동일 선박을 각자 추적하는 시나리오가 현재 스키마로는 불가능하다.
- **수정 방향 (최소 변경)**: `@@unique([account, mmsi])` 복합 unique로 전환. 폴러에서 MMSI 기준 dedup 후 API 호출, 결과를 해당 MMSI를 구독하는 모든 계정에 브로드캐스트.
- **수정 방향 (장기)**: `VesselAccount` 중간 테이블 도입 — 선박 물리 정보와 계정별 표시 설정 분리.
- **예상 시간**: 옵션 A 2~3시간 (마이그레이션 포함)

---

### P2 — 다음 릴리즈 수정 (성능·코드 품질)

#### P2-1. [index.js:24-34] — 인증 엔드포인트 Rate Limit 누락
- **영역**: 보안(Medium #6)
- **문제**: `/api/auth`에 rate limit 없음. 비밀번호 최소 4자 정책과 결합 시 브루트포스에 무방비.
- **수정 방향**: `/api/auth`에 `rateLimit({ windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true })` 적용. 비밀번호 최소 길이 12자로 상향.
- **예상 시간**: 30분

#### P2-2. [App.jsx:359-373] — health 폴링 10초 간격 제거
- **영역**: 성능(권장 #2)
- **문제**: `/api/health`를 10초마다 폴링. WebSocket `onclose`/`onerror` 이벤트로 이미 연결 감지가 가능하므로 중복. 하루 8,640번 불필요한 HTTP 요청.
- **수정 방향**: `useWebSocket`에서 connected 상태를 반환하도록 확장하고 health 폴링 제거.
- **예상 시간**: 1시간

#### P2-3. [App.jsx] — God Component 분리
- **영역**: 아키텍처(구조 #2)
- **문제**: App.jsx 609줄에 인증, 선박 CRUD, 그룹 관리, WebSocket, UI 레이아웃, 인쇄용 컴포넌트가 혼재.
- **수정 방향**: `useAuth.js`, `useVessels.js`, `useGroups.js` 커스텀 훅 분리. `ReportTable`, `ZoneToast` 별도 파일로 추출.
- **예상 시간**: 3~4시간

#### P2-4. [index.js:153-158] — 환경변수 평문 자격증명
- **영역**: 보안(Low #9)
- **문제**: `ACCOUNTS=admin:password,user:pass` 환경변수 형태 초기 시드. 배포 스크립트·CI 로그에 자격증명 노출 가능.
- **수정 방향**: 최초 실행 시 랜덤 비밀번호 생성 후 1회 콘솔 출력, 또는 시크릿 관리 도구 사용.
- **예상 시간**: 1시간

#### P2-5. [App.jsx:565] — JSX 인라인 복잡 표현식
- **영역**: 스타일(권장 #3)
- **문제**: `customGroups` 필터 로직이 JSX prop 안에 인라인으로 작성되어 가독성 저하.
- **수정 방향**: `useMemo`로 추출.
- **예상 시간**: 15분

#### P2-6. [구조화된 로깅 부재]
- **영역**: 아키텍처(설계 #5)
- **문제**: 전체 백엔드에서 `console.*`만 사용. 로그 레벨 조정·파일 출력·요청 ID 추적 불가.
- **수정 방향**: `winston` + `winston-daily-rotate-file` 도입. 일자별 파일 rotation, 에러 별도 파일. (요청 기능 1번과 직접 연결)
- **예상 시간**: 2시간

---

### P3 — 나중에 (낮은 심각도·스타일)

#### P3-1. [wsServer.js:33] — `readyState === 1` 하드코딩
- `WebSocket.OPEN` 상수로 교체. (15분)

#### P3-2. [index.js:25,30 / App.jsx:43 / admin.js:74] — 매직 넘버 반복
- `RATE_LIMIT_WINDOW_MS`, `STALE_THRESHOLD_MS`, `MONTHLY_API_LIMIT` 상수 파일로 추출. (30분)

#### P3-3. [datalasticPoller.js:84 등] — 빈 catch 블록 6곳 이상
- 최소한 `console.warn(e.message)` 수준의 로깅 추가. ESLint `no-empty` 규칙 적용. (30분)

#### P3-4. [accounts.js:30] — 캐시 비밀번호 타이밍 공격
- P0-1 bcrypt 전환 후 자동 해소됨.

#### P3-5. [shares.js:47-76] — 공유 링크 접근 로깅 없음
- 토큰 접근 시도 IP 로깅 + rate limit 추가. (30분)

#### P3-6. [Map/index.jsx:10-68] — computeDynamicOffsets O(N²) 잠재적 병목
- 향후 사용 시 `useMemo` 적용 필수. 현재 미사용 상태라 즉각적 병목 없음. (15분)

#### P3-7. [admin.js:50-57] — Raw SQL 사용
- Prisma groupBy + JavaScript 집계로 교체. DB 이식성 향상. (1시간)

---

## 영역별 요약

| 영역 | 점수 | 핵심 발견 | 자동화 가능 |
|------|------|---------|-----------|
| 스타일 | C | 폴링 코드 중복(변수명 불일치 이미 발생), 좌표 0 버그 2곳, 빈 catch 블록 6곳 | ESLint no-empty, Prettier |
| 보안 | D | 비밀번호 평문 DB/localStorage/WebSocket URL 3중 노출, CORS wildcard, rate limit 누락 | Semgrep, npm audit |
| 성능 | B | 순차 API 호출(30척 9초), N+1 쿼리(pollPositions+forceUpdate+history), health 폴링 중복 | Node --prof |
| 아키텍처 | C | MMSI unique 다계정 공유 불가, App.jsx God Component(609줄), DIP 위반(app.locals 암묵적 의존) | SonarQube |

---

## 영역 간 중복 이슈 통합

| 이슈 | 언급 영역 수 | 통합 우선순위 | 비고 |
|------|------------|------------|------|
| 비밀번호 평문 저장 | 보안+스타일+아키텍처 (3개) | P0 | 가장 많이 지적된 이슈 |
| pollPositions/forceUpdate 중복 | 스타일+성능+아키텍처 (3개) | P1 | 성능과 유지보수 모두 영향 |
| accounts.js 캐시 구조 | 보안+아키텍처 (2개) | P0-1에 통합 | bcrypt 전환 시 함께 해결 |
| localStorage 분산 접근 | 스타일+아키텍처 (2개) | P2 | storage.js 유틸 분리 |

---

## 영역 간 충돌 해결

| 충돌 | 영역 1 | 영역 2 | 판정 | 근거 |
|------|--------|--------|------|------|
| 계정 캐시 TTL 30초 적절성 | 성능: 현재 단일 프로세스에서 적절 | 보안: PM2 클러스터 확장 시 비밀번호 변경 미반영 30초 지연 | 보안 우선, P0-1 bcrypt 전환 후 캐시 구조 재설계 | 보안 문제가 성능 이득보다 크다 |
| Promise.allSettled 병렬화 | 성능: 5x 속도 향상 | 성능(트레이드오프): Datalastic rate limit 초과 시 429 에러 | 조건부 채택 — CHUNK=3으로 보수적 시작, Datalastic 요금제 확인 후 증가 | rate limit 초과는 API 크레딧 낭비로 이어짐 |
| geofenceChecker 공간 인덱스 도입 | 성능: O(Z) → O(Z/36) 평균 | 아키텍처: 코드 복잡도 증가, war-risk 파일 크기 확인 필요 | 조건부 채택 — war-risk-zone-global.geojson의 실제 zone 수 확인 후 결정 | 현재 zone 수 불명확, 섣부른 최적화 방지 |

---

## 액션 아이템 (우선순위별)

| # | 항목 | 우선순위 | 예상 시간 | 비고 |
|---|------|---------|----------|------|
| 1 | bcrypt 비밀번호 해시 도입 + 세션 토큰 발급 | P0 | 3~4시간 | accounts.js, App.jsx, admin.js 함께 수정 |
| 2 | WebSocket URL 쿼리 파라미터 방식 폐기 → 첫 메시지 인증 | P0 | 1시간 | #1 완료 후 처리 |
| 3 | 좌표 0,0 버그 수정 (`!lat && !lon` → `isNaN`) | P0 | 15분 | datalasticPoller.js 2곳 |
| 4 | processVessel 공통 함수 추출 + N+1 쿼리 제거 | P1 | 2~3시간 | pollPositions, forceUpdate 통합 |
| 5 | 히스토리 저장 N+1 쿼리 제거 | P1 | 30분 | vessels.js |
| 6 | /api/shares/view 경로 정규식 매칭으로 교체 | P1 | 15분 | index.js |
| 7 | CORS origin whitelist 환경변수화 | P1 | 30분 | index.js |
| 8 | schema.prisma mmsi unique → (account, mmsi) 복합 unique | P1 | 2~3시간 | 마이그레이션 스크립트 필요 |
| 9 | /api/auth rate limit + 비밀번호 정책 12자 강화 | P2 | 30분 | index.js, admin.js |
| 10 | health 폴링 제거, useWebSocket connected 상태 반환 | P2 | 1시간 | App.jsx, useWebSocket.js |
| 11 | winston 구조화 로깅 도입 (요청 기능 1번) | P2 | 2시간 | backend/src/utils/logger.js |
| 12 | App.jsx God Component 분리 (useAuth, useVessels, useGroups) | P2 | 3~4시간 | 기능에는 영향 없음 |
| 13 | 매직 넘버 상수화, 빈 catch 블록 로깅 추가 | P3 | 1시간 | ESLint 설정과 함께 |

---

## 요청된 기능과의 관계

이번 PR이 포함하는 요청 기능 3가지와 리뷰 결과의 연관성:

### 기능 1: 로깅 시스템 (일자별 파일 분리 + Rotation)
- P2-6(아키텍처 설계 #5) 그대로 구현 가능.
- `winston` + `winston-daily-rotate-file` 도입, `backend/src/utils/logger.js` 생성.
- P0-1 보안 수정과 함께 로그인 시도 감사 로그를 동시에 추가하면 시너지가 크다.
- **의존성 없음 — 독립적으로 먼저 구현 가능.**

### 기능 2: 다계정 선박 공유 (VesselAccount)
- P1-5(아키텍처 구조 #1) 해결이 선행 조건.
- 옵션 A(복합 unique)는 최소 2~3시간, 옵션 B(VesselAccount 중간 테이블)는 1~2일 작업.
- P1-1(코드 중복 제거)과 함께 처리하면 폴러 dedup 로직을 한 번에 정리할 수 있다.
- **P1-5 먼저 완료 후 진행 권장.**

### 기능 3: War Risk Zone 탐지
- `geofenceChecker.js`의 기존 geofence 인프라를 재활용 가능. GeoJSON 파일 추가 로드 방식.
- P3-6(O(N²) computeDynamicOffsets) 및 성능 #4(공간 인덱스)와 연관됨 — war-risk-zone-global.geojson의 실제 zone 수 확인 필요.
- zone 수가 100개 초과이면 P1-1(processVessel 추출)과 함께 공간 인덱스 도입 고려.
- **기존 구조 위에서 구현 가능. P0 보안 수정 후 바로 진행 가능.**

---

## 기능 구현 로드맵 (리뷰 반영)

```
Week 1 (보안 + 버그)
  P0-1: bcrypt + 세션 토큰
  P0-2: WS URL 인증 변경
  P0-3: 좌표 0 버그 수정

Week 2 (구조 개선 + 기능 1)
  P1-1: processVessel 추출 + N+1 제거
  P1-2: 히스토리 N+1 제거
  P1-3~4: CORS, 경로 정규화
  P2-6: winston 로깅 시스템 (기능 1)

Week 3 (기능 2 + 기능 3)
  P1-5: schema.prisma 다계정 지원
  기능 2: VesselAccount 구현
  기능 3: War Risk Zone 추가

Week 4 (품질)
  P2-1~5: rate limit, health 폴링, God Component 분리
  P3: 매직 넘버, 빈 catch, raw SQL 정리
```

---

## 칭찬할 점

1. **`checkSpoofing` 순수 함수**: AIS 스푸핑 탐지 로직이 외부 의존 없이 순수 함수로 추출되어 `datalasticPoller.js`와 `vessels.js` 양쪽에서 재사용된다. 도메인 로직을 서비스 구현과 분리한 올바른 방향이다.

2. **Route Factory 패턴**: `vesselRoutes(prisma)`, `adminRoutes(prisma)` 등 모든 라우트가 팩토리 함수로 prisma를 주입받는다. Express 앱에서 흔한 전역 prisma 참조 패턴을 피했다.

3. **`geofenceChecker.js`의 BBox 사전 필터**: Ray Casting 전에 Bounding Box 필터로 불필요한 연산을 최소화했다. 외부 의존성 없이 구현한 점도 배포 안정성에 기여한다.

4. **`cleanup.js`**: 상수명이 명확하고(`THIRTY_DAYS_MS`, `INTERVAL_MS`), 함수가 단일 책임을 깔끔하게 수행한다. 프로젝트 내 가장 이상적인 스타일로 작성된 파일이다.

5. **`useWebSocket.js`의 클로저 문제 해결**: `onMessageRef`로 stale closure 문제를 올바르게 처리하고, 3초 재연결 로직의 cleanup도 깔끔하다.

---

## 학습 자료

- **bcrypt 도입**: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- **WebSocket 인증 패턴**: MDN WebSocket API, RFC 6455 §10.5 (WebSocket over TLS)
- **N+1 쿼리 패턴**: Prisma 공식 문서 "Select distinct" + "Relation queries"
- **React God Component 분리**: "Custom Hooks" — React 공식 문서, Kent C. Dodds의 "Compound Components" 패턴
- **OWASP Top 10 2021**: A02(암호화 실패), A05(보안 설정 오류), A07(인증 실패) 항목
- **winston 구조화 로깅**: `winston-daily-rotate-file` npm 패키지 문서

---

## 최종 산출물 체크리스트

- [x] 스타일 리뷰 완료 (발견: 필수 4, 권장 9, 참고 6)
- [x] 보안 리뷰 완료 (발견: Critical 2, High 3, Medium 3, Low 2)
- [x] 성능 리뷰 완료 (발견: 필수 3, 권장 5, 참고 3)
- [x] 아키텍처 리뷰 완료 (발견: 구조 4, 설계 6, 참고 3)
- [x] 영역 간 중복 이슈 통합 (비밀번호 평문, 코드 중복 등 3건 통합)
- [x] 영역 간 충돌 해결 (캐시 TTL vs 보안, 병렬화 vs rate limit 등)
- [x] 액션 아이템 생성 (총 13건, P0~P3 우선순위 부여)
- [x] 요청 기능 3가지와의 연관성 명시
- [x] 기능 구현 로드맵 반영
