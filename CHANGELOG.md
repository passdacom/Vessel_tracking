# Vessel Tracking — 변경 이력 (CHANGELOG)

변경사항은 날짜 역순으로 기록합니다. Git 커밋 시 이 파일도 함께 커밋합니다.

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
