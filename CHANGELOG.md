# Vessel Tracking — 변경 이력 (CHANGELOG)

변경사항은 날짜 역순으로 기록합니다. Git 커밋 시 이 파일도 함께 커밋합니다.

---

## [2026-03-17] — 다중 구역 선택 + 투명도 개별 조절

### 변경 파일

| 파일 | 유형 | 요약 |
|---|---|---|
| `frontend/src/App.jsx` | MODIFY | `selectedRegions[]` 상태 추가, `handleToggleRegion` 핸들러 |
| `frontend/src/components/Map/index.jsx` | MODIFY | `selectedRegions`, `toggleSelectedRegion` prop 전달 |
| `frontend/src/components/Map/RestrictedZone.jsx` | MODIFY | `useRef+setStyle` 방식 다중 구역 토글 + 투명도 분리 적용 |
| `frontend/src/components/Sidebar/index.jsx` | MODIFY | 다중 구역 표시 UI, Opacity 슬라이더 |

### 주요 기능
- War Risk Zone 클릭 → 토글 방식 다중 선택
- 선택 구역에만 Opacity 슬라이더 개별 적용
- `GeoJSON` key 변경 없이 `useRef+setStyle`로 스타일 업데이트 (이벤트 리스너 보존)

### Git Commit
- SHA: `80cf763`, Merge: `52bbc26`
- Branch: `claude/vessel-tracking-app-E9py3`

---

## [2026-03 이전] — 이전 기록

```bash
git log --oneline -10
```
