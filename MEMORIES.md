# MEMORIES.md - Vessel Tracking 프로젝트 규칙 및 교훈

## 배포 규칙 (ALWAYS 따를 것)

- ALWAYS 코드 변경사항은 **반드시 서버(192.168.0.107)에 먼저 배포**해야 한다.
  - 파일 수정 → `scp`로 서버 복사 → `npm run build` → PM2 재시작
  - 서버 경로: `/root/.openclaw/workspace/Vessel_tracking/`
  - SSH: `ssh -i /Users/hansungpil/.ssh/id_ed25519 root@192.168.0.107`
- ALWAYS 사용자로부터 "이상 없음" 확인을 받은 **이후에만 GitHub에 커밋**한다.
- NEVER 로컬 파일만 수정하고 배포했다고 알리면 안 된다. 반드시 서버 배포까지 완료해야 한다.

## 서버 배포 표준 절차

```bash
# 1. 변경된 파일 서버로 복사
scp -i /Users/hansungpil/.ssh/id_ed25519 <로컬_파일> root@192.168.0.107:<서버_경로>

# 2. 프론트엔드 빌드
ssh -i /Users/hansungpil/.ssh/id_ed25519 root@192.168.0.107 \
  "cd /root/.openclaw/workspace/Vessel_tracking/frontend && npm run build 2>&1 | tail -10"

# 3. PM2 재시작
ssh -i /Users/hansungpil/.ssh/id_ed25519 root@192.168.0.107 \
  "pm2 restart vessel-frontend vessel-backend"
```

## 프로젝트 구조

- **프론트엔드 로컬**: `/Users/hansungpil/workspace/Vessel_tracking/frontend/`
- **프론트엔드 서버**: `/root/.openclaw/workspace/Vessel_tracking/frontend/`
- **백엔드 로컬**: `/Users/hansungpil/workspace/Vessel_tracking/backend/`
- **백엔드 서버**: `/root/.openclaw/workspace/Vessel_tracking/backend/`
- **서비스 URL**: `https://vessel.ttacom.net`

## 알려진 이슈 및 주의사항

- NEVER 국기 이모지(`flagEmoji`) 관련 코드를 추가하지 말 것 (사용자가 삭제 요청)
- NEVER `자사`/`타사` 소속 뱃지를 VesselCard 헤더에 표시하지 말 것 (사용자가 삭제 요청)
- NEVER War Risk Zone에 마우스오버 툴팁이나 클릭 팝업을 추가하지 말 것 (사용자가 삭제 요청)
- ALWAYS Stale vessel(트랙 기간 초과 선박)은 회색 반투명으로 표시하고 숨기지 말 것
- ALWAYS 코드 변경 후  에 변경 내역을 기록할 것
- ALWAYS 코드베이스 구조 변경(파일 추가/삭제, API 변경, DB 스키마 변경)이 있으면 스킬 파일  도 함께 업데이트할 것
- ALWAYS 세션 시작 시 전체 코드베이스를 다시 분석하지 말고, 스킬 파일(**vessel-tracking-codebase**)을 먼저 참조할 것
- NEVER 이미 파악된 구조(DB 스키마, API, 파일 경로 등)를 다시 SSH로 탐색하지 말 것. 스킬 파일에 없는 정보만 확인 가능

## 코드베이스 레퍼런스 스킬

- 스킬명: **vessel-tracking-codebase**
- 경로: 
- 포함 정보: 서버 접속 정보, 전체 파일 구조, DB 스키마, API 엔드포인트, 배포 절차, Frontend 상태 목록, 주의사항

## 변경사항 기록 의무 (추가됨 2026-03-17)

- ALWAYS 코드 변경 후  에 변경 내역을 기록할 것
- ALWAYS 코드베이스 구조 변경(파일 추가/삭제, API 변경, DB 스키마 변경)은 스킬 파일도 업데이트할 것
- ALWAYS 세션 시작 시 코드베이스를 처음부터 SSH 탐색하지 말고 스킬 **vessel-tracking-codebase** 를 먼저 참조
- NEVER 이미 스킬에 기록된 구조 정보를 SSH 재탐색하는 낭비를 하지 말 것

## 코드베이스 레퍼런스 스킬 위치

- 로컬: 
- 포함: 서버접속, 파일구조, DB스키마, API, 배포절차, Frontend 상태, 주의사항 전체
---

## 변경사항 기록 의무 (추가됨 2026-03-17)

- ALWAYS 코드 변경 후 `/root/.openclaw/workspace/Vessel_tracking/CHANGELOG.md` 에 변경 내역을 기록할 것
- ALWAYS 코드베이스 구조 변경(파일 추가/삭제, API 변경, DB 스키마 변경)은 스킬 파일도 업데이트할 것
- ALWAYS 세션 시작 시 코드베이스를 처음부터 SSH 탐색하지 말고 스킬 **vessel-tracking-codebase** 를 먼저 참조
- NEVER 이미 스킬에 기록된 구조 정보를 SSH 재탐색하는 낭비를 하지 말 것

## 코드베이스 레퍼런스 스킬 위치

- 로컬: `/Users/hansungpil/workspace/openclaw/.agents/skills/vessel-tracking-codebase/SKILL.md`
- 포함: 서버접속, 파일구조, DB스키마, API, 배포절차, Frontend 상태, 주의사항 전체
