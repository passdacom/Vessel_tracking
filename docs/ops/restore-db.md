# Vessel Tracking DB 복구 절차

이 절차는 PostgreSQL custom dump(`pg_dump -Fc`) 백업 파일을 사용한다. 운영 DB 복구는 데이터 되돌림을 동반하므로, 실제 실행 전 현재 DB를 한 번 더 백업한다.

## 1. 백업 파일 확인

```bash
backup_file=/root/.openclaw/backups/vessel_tracking/vessel_tracking_YYYYMMDD_HHMMSS_pre_deploy.dump
ls -lh "$backup_file"
cat "$backup_file" | docker exec -i vessel_tracking-postgres-1 pg_restore -l | head
```

listing이 출력되지 않으면 복구를 진행하지 않는다.

## 2. 복구 전 현재 DB 보존

```bash
backup_dir=/root/.openclaw/backups/vessel_tracking
mkdir -p "$backup_dir"
ts=$(date -u +%Y%m%d_%H%M%S)
current_backup="$backup_dir/vessel_tracking_${ts}_before_restore.dump"

docker exec vessel_tracking-postgres-1 \
  pg_dump -U vessel_user -d vessel_tracking -Fc > "$current_backup"

ls -lh "$current_backup"
cat "$current_backup" | docker exec -i vessel_tracking-postgres-1 pg_restore -l > "/tmp/$(basename "$current_backup").list"
wc -l "/tmp/$(basename "$current_backup").list"
```

## 3. 앱 일시 중지

```bash
pm2 stop vessel-backend
pm2 stop vessel-frontend
```

## 4. DB 재생성 후 복구

```bash
docker exec vessel_tracking-postgres-1 \
  psql -U vessel_user -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'vessel_tracking' AND pid <> pg_backend_pid();"

docker exec vessel_tracking-postgres-1 \
  dropdb -U vessel_user vessel_tracking

docker exec vessel_tracking-postgres-1 \
  createdb -U vessel_user vessel_tracking

cat "$backup_file" | docker exec -i vessel_tracking-postgres-1 \
  pg_restore -U vessel_user -d vessel_tracking --clean --if-exists
```

## 5. 복구 후 검증과 앱 재시작

```bash
docker exec vessel_tracking-postgres-1 \
  psql -U vessel_user -d vessel_tracking -tAc "select pg_size_pretty(pg_database_size('vessel_tracking'));"

cd /root/.openclaw/workspace/Vessel_tracking/backend
npx prisma validate

pm2 start vessel-backend
pm2 start vessel-frontend
pm2 list --no-color
curl -fsS http://127.0.0.1:3001/api/health
```

브라우저에서 로그인, 지도 표시, 선박 위치, WebSocket 연결, 공유 링크 조회를 확인한다.

