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
