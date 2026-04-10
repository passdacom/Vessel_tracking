# Vessel Tracking — 변경 이력 (CHANGELOG)

변경사항은 날짜 역순으로 기록합니다. Git 커밋 시 이 파일도 함께 커밋합니다.

---

## [2026-04-10] — 선박명 라벨 리팩토링 (충돌 회피 + 가독성 개선)

### 변경 파일

| 파일 | 유형 | 요약 |
|------|------|------|
| `frontend/src/components/Map/VesselMarker.jsx` | MODIFY | `Tooltip permanent` 추가; `labelDirection` prop; `tooltipAnchor` 방향 연동 |
| `frontend/src/components/Map/index.jsx` | MODIFY | `DraggableVesselLabel` 제거; 픽셀 기반 8방향 충돌 회피 알고리즘 + `LabelDirectionComputer` 추가 |
| `frontend/src/index.css` | MODIFY | `.vessel-name-tooltip` CSS (불투명 배경, 그림자, 화살표 색상) |

### 주요 변경

- **라벨 형태 변경**: 텍스트+그림자 → **불투명 흰색 배경 박스** (겹쳐도 각각 읽힘)
- **충돌 회피**: `computeDynamicOffsets` (lat/lon 기반, dead code) → 픽셀 좌표 기반 4방향 그리디 알고리즘
  - `map.latLngToContainerPoint()`로 실제 화면 픽셀 좌표 사용
  - 라벨↔라벨, 라벨↔선박아이콘 겹침 넓이(px²) 최소화
  - zoom 변경 시 자동 재계산 (`zoomend` 이벤트)
- **드래그 기능 제거**: `DraggableVesselLabel.jsx` 미사용 (localStorage 라벨 위치 더 이상 적용 안 됨)
- **stale 선박**: 회색 텍스트 + ⏸ 접두사 유지

---

## [2026-04-10] — HRA 배지 미표시 / 배지 깜빡임 / 진입 로그 누락 버그 수정

### 버그 원인 분석

| # | 증상 | 원인 |
|---|------|------|
| 1 | 기존 HRA 선박 배지 미표시 | `GET /positions` 응답에 `currentZones` 없음 (메모리 상태가 API에 미포함) |
| 2 | 신규 추가 선박 배지 깜빡임 | WS `position` 이후 `vessel_added` 위치 재조회가 currentZones 없이 덮어씀 |
| 3 | 기존 선박 진입 로그 없음 | `initState()`가 허위 entry 방지 목적으로만 작성돼 복원 로직 없었음 |

### 변경 파일

| 파일 | 유형 | 요약 |
|------|------|------|
| `backend/src/routes/vessels.js` | MODIFY | `geofenceChecker` import 추가; `GET /:id/positions` 응답의 `positions[0]`에 `currentZones` 주입 |
| `backend/src/services/geofenceChecker.js` | MODIFY | `initState()`: 현재 HRA 내 선박 중 DB에 entry 기록 없는 경우 자동 복원 (중복 방지 로직 포함) |

### 동작 변경

- **페이지 로드 즉시**: 위치 API 응답의 최신 위치에 `currentZones` 포함 → 배지 즉시 표시
- **신규 선박 추가**: `forceUpdate` 이후 위치 재조회해도 `currentZones` 유지 (race condition 해결)
- **서버 재시작**: HRA 내 선박 중 entry 로그 없는 경우 자동 복원, Admin 로그에 즉시 표시
- **중복 방지**: 마지막 이벤트가 이미 `entry`이면 복원 생략

### API 변경 없음 (하위 호환)

---

## [2026-03-17] — 선박 그룹 관리 기능 추가

### 변경 파일

| 파일 | 유형 | 요약 |
|---|---|---|
| `backend/src/routes/vessels.js` | MODIFY | POST + PATCH에 `companyType` 파라미터 수용 |
| `frontend/src/components/AddVesselModal.jsx` | MODIFY | 그룹 선택 버튼(자사간사/타사간사) 추가 |
| `frontend/src/App.jsx` | MODIFY | `handleAddVessel`에 `companyType` 인자 추가 |
| `frontend/src/components/Sidebar/VesselCard.jsx` | MODIFY | "그룹 변경" 버튼 + 드롭다운 UI 추가 |

### 주요 기능
- **선박 추가 시 그룹 선택**: AddVesselModal에 자사간사/타사간사 토글 버튼 추가
- **기존 선박 그룹 변경**: VesselCard에 "그룹 변경" 버튼 → 드롭다운으로 즉시 변경 가능
- 변경 즉시 사이드바 그룹 분류에 반영 (DB 영속 저장)

### Backend API 변경 이력
- `POST /api/vessels` — body에 `companyType` 포함 가능 (기본값: `'자사간사'`)
- `PATCH /api/vessels/:id` — `companyType` 변경 지원 추가

### Git Commit
- SHA: (다음 커밋에서 채울 것)
- Branch: `claude/vessel-tracking-app-E9py3`

---

## [2026-03-17] — 코드베이스 문서화 및 MEMORIES 규칙 추가

### 변경 파일

| 파일 | 유형 | 요약 |
|---|---|---|
| `MEMORIES.md` | MODIFY | 스킬 참조 규칙, 변경기록 의무 규칙 추가 |
| `CHANGELOG.md` | NEW | 이 파일 최초 생성 |

### Git Commit
- SHA: `05e6269`
- Branch: `claude/vessel-tracking-app-E9py3`

---

## [2026-03 이전] — War Risk Zone 다중 구역 선택 + 투명도 조절

### Git Commit
- SHA: `80cf763` / Merge: `52bbc26`
- Branch: `claude/vessel-tracking-app-E9py3`
- 내용: `selectedRegions[]` 배열로 다중 구역 토글, 구역별 Opacity 슬라이더

---

*이전 기록은 `git log --oneline` 참조*
