# 코드 스타일 리뷰 — ShippingLanes 컴포넌트 + lanes.js 라우터

**검토 일시**: 2026-04-19
**검토 파일**:
- `frontend/src/components/ShippingLanes/LaneEditor.jsx`
- `frontend/src/components/ShippingLanes/LaneList.jsx`
- `frontend/src/components/ShippingLanes/LaneManager.jsx`
- `backend/src/routes/lanes.js`

---

## 이슈 목록

| # | 파일:라인 | 설명 | 심각도 |
|---|-----------|------|--------|
| 1 | `LaneList.jsx:151` | `{!showAll && lanes.some((l) => !l.active) ? "" : ""}` — 양쪽 분기가 모두 빈 문자열을 반환하는 삼항 연산자. 어떤 조건에서도 아무것도 렌더링하지 않으므로 완전한 dead code. 비활성 항로 수를 표시하려는 의도였을 가능성이 높으나 구현이 누락된 채 방치됨. 삭제하거나 의도를 반영한 콘텐츠로 교체해야 한다. | high |
| 2 | `LaneEditor.jsx:161-164` | `handleImport`에서 `setImporting(false)`가 `try/catch` 이후에 위치. `catch` 내부에서 `return`이 없어 현재는 동작하지만, 향후 조기 리턴 추가 시 `setImporting`이 호출되지 않아 로딩 상태가 영원히 남는 버그를 유발. `finally { setImporting(false) }` 패턴 사용 권장. `handleSave`(L193-195, `setSaving(false)`)도 동일 문제. | medium |
| 3 | `LaneEditor.jsx:371-411` | `waypoints.map((wp, idx)`에서 `key={`wp-${idx}`}` 사용. 배열 인덱스를 key로 사용하는 것은 React에서 지양하는 패턴으로, 웨이포인트 중간 삭제/삽입 시 컴포넌트 재사용 오류를 유발할 수 있다. 좌표 기반 식별자(`wp-${wp[0]}-${wp[1]}`) 또는 삽입 시 UUID를 부여하는 방식 권장. | medium |
| 4 | `LaneManager.jsx:33-37` | `handleSaved` 함수 본문이 `handleEditorClose`(L28-31)와 완전히 동일(`setEditingLane(null); setView("list")`). 명백한 DRY 위반. 공통 함수 `returnToList`로 추출하거나 `handleSaved`를 `handleEditorClose`로 대체 권장. | medium |
| 5 | `lanes.js:54` | `if (!id)` — `parseInt`가 `NaN`을 반환하면 falsy이므로 동작하지만, `id === 0`도 falsy로 걸러진다. `0`이 유효한 ID는 아니지만 의도가 불명확. `isNaN(id) \|\| id <= 0` 조건이 더 명시적이고 안전. `lanes.js:107`, `157`도 동일 패턴. | medium |
| 6 | `LaneEditor.jsx:14` | `makeWpIcon` 내 `isMoved` 변수 선언 후 한 줄만 사용. 변수명 `isMoved`는 과거형처럼 읽혀 "이동된 상태"와 "이동 모드 활성화" 의미가 혼동될 수 있다. 제거하고 `mode === "move"`를 인라인으로 쓰거나, `isMoving`으로 이름 변경 권장. | low |
| 7 | `LaneEditor.jsx:161, 191` | `catch (e)` 블록 파라미터 이름이 `e`. 동일 파일에서 일관되게 `e`를 사용하므로 파일 내 일관성은 있으나, `LaneList.jsx:50,68`에서는 파라미터 없는 `catch {}` 형태를 사용하여 프로젝트 내 불일치. 한 가지 스타일로 통일 필요(`catch (err)` 권장). | low |
| 8 | `LaneEditor.jsx:169-170` | `handleSave` 내 두 개의 guard 문이 같은 줄에 `{ setError(...); return; }` 인라인 형태로 작성됨. 파일 전체의 나머지 제어 흐름 코드가 여러 줄 블록 스타일인데 이 부분만 인라인 형태로 스타일 불일치. | low |
| 9 | `LaneEditor.jsx:199` | `style={{ zIndex: 500 }}` 인라인 스타일. 프로젝트 전반이 Tailwind 기반인데 `zIndex`만 인라인 처리됨. `className`에 `z-[500]` arbitrary value로 통일 권장. `LaneEditor.jsx:419`(`zIndex: 400`)도 동일. | low |
| 10 | `LaneEditor.jsx:217` | 모드 정의 배열 내 정렬용 다중 공백 사용(`"add",    label:`). 탭 정렬 스타일은 Prettier/ESLint와 충돌하고 diff를 오염시킨다. 단일 공백으로 통일 권장. | low |
| 11 | `LaneEditor.jsx:289` | `style={{ minWidth: 160 }}` 인라인 스타일. `min-w-40` Tailwind 클래스로 대체 가능하여 다른 요소들과 스타일 관리 방식 통일. | low |
| 12 | `LaneList.jsx:35` | `useEffect(() => { fetchLanes(); }, [fetchLanes])` 가 한 줄로 압축. 파일 내 다른 `useEffect` 호출이 여러 줄 블록 스타일이므로 스타일 불일치. 사소하지만 일관성 저하. | low |
| 13 | `LaneList.jsx:102` | `onClick={() => onNew()}` — 불필요한 람다 래퍼. `onClick={onNew}`로 직접 전달 가능. `LaneList.jsx:141`도 동일. | low |
| 14 | `LaneManager.jsx:34` | `handleSaved` 내 주석 `// 저장 후 목록으로 돌아가기`는 함수명으로 이미 충분히 전달됨. 반면 `handleEditorClose`는 주석이 없어 비대칭. 불필요한 주석은 제거하거나 모든 함수에 일관되게 추가. | low |
| 15 | `lanes.js:64` | 주석 `// ── 이하 admin only`만 있고, 그 위의 GET 엔드포인트 두 개가 인증 사용자라면 누구나 접근 가능하다는 사실이 명시되지 않음. `// ── GET / GET /:id — 인증 사용자 전체 허용 (adminGuard 미적용)` 주석으로 의도를 명확히 표시 권장. | low |
| 16 | `lanes.js:95, 145, 164` | logger 메시지에서 한국어(`[lanes] 생성:`, `[lanes] 수정:`, `[lanes] 삭제:`)와 HTTP 응답 에러 메시지(`"Internal server error"`, `"Lane not found"`)가 한국어/영어로 이원화됨. 의도된 것이라면 주석으로 명시 권장. | low |
| 17 | `lanes.js:141` | `updatedAt: new Date()`를 Prisma `update` data에 명시적으로 주입. Prisma 스키마에 `@updatedAt`이 설정되어 있다면 자동 갱신되므로 중복. 스키마 확인 후 불필요하면 제거 권장. | low |
| 18 | `lanes.js:148, 167` | Prisma 에러 코드 `P2025` catch 처리가 있지만, 해당 블록 이전에 이미 `findUnique` + 404 반환 경로가 존재(L110, L161). 두 경로가 모두 존재하여 역할이 중복. race condition 방어 목적이라면 `// race condition 방어` 주석으로 명시 권장. | low |

---

## 전반적 평가

### 긍정적인 부분

- **컴포넌트 책임 분리가 명확하다.** `LaneManager`(뷰 상태 라우팅) → `LaneList`(목록 CRUD) → `LaneEditor`(지도 편집) 계층 구조가 단방향으로 정리되어 있고, 각 컴포넌트의 역할이 명확하게 구분된다.
- **한글 주석이 풍부하고 도메인 맥락 파악이 용이하다.** 함수, 섹션, JSX 구조 구분선이 한글로 설명되어 있어 코드베이스에 처음 합류하는 개발자도 빠르게 이해할 수 있다.
- **camelCase 네이밍이 React 컨벤션을 일관되게 따른다.** 이벤트 핸들러(`handleAdd`, `handleDelete`, `handleToggleActive`), 상태 변수(`saving`, `importing`, `refTrack`), props 이름 모두 명확하고 일관적이다.
- **백엔드 유효성 검사 구조가 잘 분리되어 있다.** `validateCoordinates`를 독립 함수로 추출하고, `adminGuard`를 `router.use()`로 미들웨어 레벨에 적용한 패턴이 명확하고 확장 가능하다.
- **`LaneManager.jsx` 전체 구조가 간결하다.** 59줄의 짧은 파일에서 뷰 상태 전환 로직만 담당하며, JSDoc 스타일 Props 설명이 인터페이스를 명확히 기술한다.

### 개선이 필요한 부분

- **Dead code (이슈 #1)** 가 가장 긴급한 문제다. `LaneList.jsx:151`의 항상-빈-문자열 삼항 연산자는 미완성 기능으로 보이며, 의도를 확인하고 즉시 정리해야 한다.
- **`finally` 미사용으로 인한 상태 누락 위험 (이슈 #2)** 은 현재는 동작하지만 유지보수 중 버그를 유발할 수 있는 구조적 결함이다. `handleImport`와 `handleSave` 양쪽 모두 `finally` 패턴으로 전환을 권장한다.
- **인덱스 key 사용 (이슈 #3)** 은 웨이포인트 중간 삽입/삭제 기능이 핵심인 LaneEditor 특성상 렌더링 문제로 이어질 가능성이 있다. 조기에 수정하는 것이 좋다.
- **`LaneManager`의 함수 중복 (이슈 #4)** 은 소규모지만 명백한 DRY 위반으로, 공통 함수 추출로 즉시 해결 가능하다.
- **인라인 스타일 혼용 (이슈 #9, #11)** 은 Tailwind arbitrary value 클래스로 통일하면 스타일 관리가 일원화된다.

---

## 요약

| 심각도 | 건수 |
|--------|------|
| high   | 1    |
| medium | 4    |
| low    | 13   |
| **합계** | **18** |

전체적으로 코드 품질은 양호하며 치명적 결함은 없다. `high` 1건(dead code)을 즉시 처리하고, `medium` 4건(finally 패턴, 인덱스 key, DRY 위반, ID 유효성 검사)을 다음 스프린트 내에 정리하는 것을 권장한다. `low` 항목들은 팀 컨벤션 논의 후 일괄 적용하면 된다.
