# Vessel Tracking 운영 배포 체크리스트

이 문서는 운영 중인 Vessel Tracking 앱을 수정할 때 사용하는 최소 안전 절차다. 현재 운영 방식은 PM2로 `vessel-backend`와 Vite dev server 기반 `vessel-frontend`를 실행하고, PostgreSQL은 Docker 컨테이너 `vessel_tracking-postgres-1`에서 동작한다.

## 1. 배포 전 기준선 기록

```bash
cd /root/.openclaw/workspace/Vessel_tracking
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
pm2 list --no-color
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
df -h /root /root/.openclaw/workspace/Vessel_tracking
```

기준선에 이미 수정된 파일이 있으면, 해당 변경이 이번 배포 범위인지 먼저 확인한다. 관련 없는 사용자 변경은 되돌리지 않는다.

## 2. DB 백업

백업 파일은 프로젝트 밖 경로에 저장한다.

```bash
backup_dir=/root/.openclaw/backups/vessel_tracking
mkdir -p "$backup_dir"
ts=$(date -u +%Y%m%d_%H%M%S)
backup_file="$backup_dir/vessel_tracking_${ts}_pre_deploy.dump"

docker exec vessel_tracking-postgres-1 \
  pg_dump -U vessel_user -d vessel_tracking -Fc > "$backup_file"

ls -lh "$backup_file"
cat "$backup_file" | docker exec -i vessel_tracking-postgres-1 pg_restore -l > "/tmp/$(basename "$backup_file").list"
wc -l "/tmp/$(basename "$backup_file").list"
```

`pg_restore -l` listing이 실패하거나 백업 파일 크기가 0이면 배포를 중단한다.

## 3. 정적 검증

```bash
cd /root/.openclaw/workspace/Vessel_tracking/backend
npx prisma validate

cd /root/.openclaw/workspace/Vessel_tracking/frontend
npm run build
```

테스트 스크립트가 추가된 뒤에는 backend/frontend 테스트도 이 단계에 포함한다.

## 4. 수동 Smoke Check

배포 전후에 아래 항목을 확인한다.

- 로그인 성공
- 지도 로딩
- 선박 목록 표시
- 최신 위치 마커 표시
- WebSocket 연결 상태 정상
- 선박 선택 시 사이드바/지도 이동 정상
- HRA 배지와 zone toast 표시 유지
- 항로 표시 토글 정상
- ETA 패널 열기, 목적지 선택, 거리/ETA 표시 정상
- 공유 링크 생성, 공개 URL 조회 정상
- admin dashboard 접근 정상
- `/api/health` 응답 정상

## 5. PM2 재시작

코드 변경 배포 시 기존 프로세스 이름을 유지한다.

```bash
cd /root/.openclaw/workspace/Vessel_tracking
pm2 restart vessel-backend
pm2 restart vessel-frontend
pm2 list --no-color
curl -fsS http://127.0.0.1:3001/api/health
```

재시작 후 최소 10분간 PM2 상태와 로그를 확인한다.

```bash
pm2 logs vessel-backend --lines 80 --nostream
pm2 logs vessel-frontend --lines 80 --nostream
```

## 6. 롤백

코드 문제라면 마지막 정상 커밋으로 되돌린 뒤 PM2를 재시작한다. DB 스키마 변경은 가능한 한 additive-only로 설계하여 이전 코드가 새 컬럼을 무시하고 동작하게 한다.

DB 데이터 복구가 필요하면 `docs/ops/restore-db.md` 절차를 따른다. 운영 DB 복구는 서비스 중단을 동반하므로, 복구 전 반드시 현재 DB를 한 번 더 백업한다.

