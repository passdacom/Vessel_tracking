# Vessel Tracking Production Runbook

Last updated: 2026-07-16

## Current production shape

- Public URL: `https://vessel.ttacom.net`
- Reverse proxy: Nginx Proxy Manager / external HTTPS endpoint and sole public ingress
- Immutable releases: `/var/lib/vessel-tracking/app/releases/<git-sha>`
- Active release: `/var/lib/vessel-tracking/app/current` (atomic symlink)
- Rollback release: `/var/lib/vessel-tracking/app/previous` (atomic symlink)
- PM2 apps:
  - `vessel-backend` — Node/Express backend on loopback `127.0.0.1:3001`
  - `vessel-frontend` — Node production static/proxy server on loopback `127.0.0.1:5173`
- PM2 home: `/var/lib/vessel-tracking/pm2` (vessel-only; not the shared `/root/.pm2` daemon)
- Backend environment file: `/etc/vessel-tracking/vessel-tracking.env` (root-owned mode `0600`)
- Frontend runtime entrypoint: `/var/lib/vessel-tracking/app/current/frontend/server.mjs`
- Frontend artifact: `/var/lib/vessel-tracking/app/current/frontend/dist`
- API proxy path: `/api/* -> http://127.0.0.1:3001`
- WebSocket proxy path: `/ws -> http://127.0.0.1:3001/ws`

## Human Gate: one-time PM2 and environment migration

Do not migrate the live supervisor during a normal code release. Schedule a maintenance window and obtain explicit operator approval. First inventory the shared daemon with `PM2_HOME=/root/.pm2 pm2 jlist`; unrelated apps must not be reloaded, deleted, or killed. Create `/etc/vessel-tracking/vessel-tracking.env` as a regular, non-symlink, root-owned mode `0600` file, populate only the reviewed backend keys, and create `/var/lib/vessel-tracking/{app,backups,pm2}`. The systemd PM2 daemon receives only `VESSEL_BACKEND_ENV_FILE=/etc/vessel-tracking/vessel-tracking.env`, never the secret-bearing file contents. `wait-for-db.js` validates and parses that file, then passes an explicit backend allowlist to the child. The frontend environment must not contain `DATABASE_URL`, API keys, account credentials, or unrelated inherited variables.

The systemd unit sets `UMask=0077` and `VESSEL_LOG_DIR=/var/log/vessel-tracking`; ecosystem config, application logger, and logrotate consume the same log-root contract. Atomic release backup/manifest directories are mode `0700`, and dump/manifest files are mode `0600`. Check with `stat -c '%a %U:%G %n' /var/lib/vessel-tracking/app/manifests /var/lib/vessel-tracking/backups /var/lib/vessel-tracking/backups/*` without displaying file contents.

Install and review `ops/systemd/pm2-root.service.example`, then stop/delete only `vessel-backend` and `vessel-frontend` from the old PM2 home. Never run `pm2 kill`, `reload all`, or `delete all`. Start the dedicated service, confirm both vessel processes use paths below `/var/lib/vessel-tracking/app/current`, run the full smoke suite, and keep the old PM2 dump until the maintenance window is closed.

The release tool fails closed if `PM2_HOME` differs from `/var/lib/vessel-tracking/pm2` or `pm2 jlist` contains any app other than `vessel-backend` and `vessel-frontend`. A maintenance exception is default-off and requires both `VESSEL_PM2_MAINTENANCE_OVERRIDE=YES` and the separate approval `APPROVE_PM2_MAINTENANCE=YES`; record the reviewed inventory and approver before using either variable. Never use this override for a routine deploy.

## Production Compose human gate

Every production Compose invocation must use the reviewed production env file explicitly; a bare `docker compose ...` command is not approved:

```bash
ENV_FILE=/etc/vessel-tracking/vessel-tracking.env
test "$(stat -c '%a:%U' "$ENV_FILE")" = '600:root'
docker compose --env-file /etc/vessel-tracking/vessel-tracking.env -f docker-compose.yml config --quiet
# Human Gate: review the resolved service/image/volume plan before the write below.
docker compose --env-file /etc/vessel-tracking/vessel-tracking.env -f docker-compose.yml up -d postgres
docker compose --env-file /etc/vessel-tracking/vessel-tracking.env -f docker-compose.yml ps
```

Stop if the env-file ownership/mode check or resolved Compose config differs from the reviewed production plan.

## One-time Prisma baseline gate (existing production database)

The repository now contains a full baseline migration plus an additive index migration. A database that existed before migration history was introduced must be baselined once. The release tool performs a read-only probe and fails closed before backup or database writes when Vessel/domain tables exist without a successful `20260715100000_baseline` row. It never runs `migrate resolve`. Baselining writes migration metadata, so take a separately verified backup and obtain the Human Gate approval first.

```bash
cd /root/.openclaw/workspace/Vessel_tracking/backend
npx prisma validate
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/vessel-baseline-diff.sql
```

Stop if the diff contains anything other than the five expected additive Sprint 0 indexes (`Vessel_active`, `Vessel_infoFetched`, `Position_vesselId_suspicious_timestamp`, `ZoneEvent_vesselId_zoneName_createdAt`, `SharedView_expiresAt`). After review and explicit approval:

```bash
npx prisma migrate resolve --applied 20260715100000_baseline
npx prisma migrate status
npx prisma migrate deploy
```

Never use `prisma db push` for production releases. Fresh databases run the baseline normally; only an already-populated, schema-matched database uses `migrate resolve`.

## Migration and rollback compatibility gate

Database rollback is schema rollback-free: application rollback changes only the immutable release and PM2 processes, never migration history or schema. Therefore every migration after `20260715100000_baseline` must contain only additive idempotent `CREATE INDEX IF NOT EXISTS ...` or `CREATE UNIQUE INDEX IF NOT EXISTS ...` statements; SQL comments and empty statements are allowed. `ALTER`, `DROP`, `DELETE`, `UPDATE`, `TRUNCATE`, rename, constraints, table creation, and all other statements fail before backup or writes, including when deploying a prebuilt release. Any broader schema change requires a separately reviewed expand/contract deployment design.

## Backup and restore drill

Before every deploy, `scripts/release.sh deploy` creates a custom-format dump and verifies its `pg_restore -l` manifest. Quarterly, restore the newest dump into an isolated disposable database and compare table counts; never test restore against production.

```bash
createdb vessel_restore_drill
pg_restore --clean --if-exists --no-owner --dbname vessel_restore_drill \
  /var/lib/vessel-tracking/backups/<verified-backup>.dump
psql -d vessel_restore_drill -c '\dt'
dropdb vessel_restore_drill
```

Record the dump path, checksum, manifest line count, restore duration, and operator. A zero-byte dump, failed manifest, or failed isolated restore blocks release.

## Deploy / reload

```bash
cd /root/.openclaw/workspace/Vessel_tracking
./scripts/release.sh                         # default: side-effect-free dry-run
export VESSEL_BACKEND_ENV_FILE=/etc/vessel-tracking/vessel-tracking.env
REVIEWED_SHA="$(git rev-parse HEAD)"
test "${#REVIEWED_SHA}" -eq 40
APPROVE_RELEASE=YES ./scripts/release.sh deploy "$REVIEWED_SHA"
```

The release tool securely loads `DATABASE_URL` from `VESSEL_BACKEND_ENV_FILE` when it is not already present; do not source or print the secret file in an operator shell. Real deploy accepts only a full 40-hex immutable commit SHA and verifies that it resolves exactly to the reviewed commit; symbolic refs are allowed only for the side-effect-free dry-run. The fail-fast flow rejects dirty worktrees and builds the reviewed commit in an isolated staging directory. It runs tests/build/Prisma validation, the index-only migration contract, the read-only legacy-baseline probe, and a read-only migration plan before the verified database backup. It records the dump SHA-256 and manifest, runs `prisma migrate deploy`, then atomically moves `current` to the versioned release. PM2 activation and deploy/rollback smoke run under sanitized environments; release smoke always pins `BASE_URL=http://127.0.0.1:5173` and canonical `EXTERNAL_URL=https://vessel.ttacom.net`, ignoring caller overrides. Only the two vessel apps are reloaded. `INT`, `TERM`, and `HUP` after activation begins restore both release links, reactivate the old vessel-only PM2 state, rerun restored smoke, and record a failed manifest when possible. A durable private manifest records timestamp, candidate SHA, release and previous paths, backup path/checksum, migration result, and smoke result.

## Human Gate: trusted reverse proxy address

The checked-in Nginx example assumes the sole upstream TLS proxy connects over loopback and trusts only `127.0.0.1` and `::1` for real-IP reconstruction. It recursively resolves that trusted peer's `X-Forwarded-For`, then overwrites the downstream header with canonical `$remote_addr`. If the upstream proxy is moved to a non-loopback address, add only its explicit reviewed CIDR as a Human Gate change. Never configure `set_real_ip_from 0.0.0.0/0` or append arbitrary inbound forwarding chains.

Password migration remains separately gated: run `npm --prefix backend run auth:migrate:dry-run`; apply with `auth:migrate:apply` only after reviewing the count and approving the data write.

## Post-restart verification

Run immediately after reload and again after 10 minutes:

```bash
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 status --no-color
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:5173/api/health
./scripts/production-smoke.sh
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 logs vessel-backend --lines 100 --nostream
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 logs vessel-frontend --lines 100 --nostream
```

Verify both PM2 processes stay `online` with stable restart counters; login returns a session token for account+password; tenant WebSocket updates do not cross accounts; a shared view expires correctly; Datalastic polling shows one active run and no credit-reserve breach; and geofence replay does not duplicate an existing entry.

## Health and smoke checks

Quick local checks:

```bash
curl -fsS http://127.0.0.1:5173/ | grep 'Vessel Tracker'
curl -fsS http://127.0.0.1:5173/api/health
curl -fsS http://127.0.0.1:5173/war-risk-zone.geojson >/dev/null
```

Full smoke:

```bash
/root/.openclaw/workspace/Vessel_tracking/scripts/production-smoke.sh
```

Expected signals:

- `/` returns HTTP 200 and contains `Vessel Tracker`
- `/api/health` returns `{"ok":true}`
- SPA fallback route returns the same production index
- `/war-risk-zone.geojson` returns valid GeoJSON
- invalid WebSocket token is rejected by backend with close code `1008`
- public `https://vessel.ttacom.net/` returns HTTP 200
- external curl and OpenSSL validate the trusted CA chain, certificate expiry, and hostname derived from `EXTERNAL_URL`; `-k`/`--insecure` is forbidden
- local readiness polling is bounded by `SMOKE_READINESS_TIMEOUT_SECONDS` (default: configured DB wait window plus 15 seconds) with per-request timeouts; there is no blind or unbounded sleep
- PM2 frontend process exec path ends with `/frontend/server.mjs`

## Logs

Primary PM2 logs:

```bash
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 logs vessel-backend --lines 100
PM2_HOME=/var/lib/vessel-tracking/pm2 pm2 logs vessel-frontend --lines 100
```

On-disk paths:

- `/var/log/vessel-tracking/backend-{out,err}.log`
- `/var/log/vessel-tracking/frontend-{out,err}.log`
- `/var/log/vessel-tracking/app/*.log`

Log rotation is configured via `/etc/logrotate.d/vessel-tracking` with `copytruncate`, `daily`, `rotate 14`, `compress`, and `maxsize 50M`.

Validate logrotate config:

```bash
logrotate -d /etc/logrotate.d/vessel-tracking
```

## Rollback

Database rollback is schema rollback-free. Only post-baseline index-only additive migrations are accepted, and rollback never reverses them. Rollback selects the exact versioned target behind `previous`; it refuses to target the active `current` release and never applies a destructive down migration. It verifies the target and backup before switching `current`, then reloads only vessel apps and runs smoke checks:

```bash
APPROVE_ROLLBACK=YES ./scripts/release.sh rollback
```

If rollback smoke fails, the script atomically restores the prior `current` target and reactivates it; the failed revision must not remain active. Stop and inspect the generated failure manifest and PM2 logs rather than repeatedly restarting. Restore a database dump only for confirmed data corruption and only through the separately approved restore procedure.

## Known non-blocking risks

- The frontend bundle currently emits a Vite chunk-size warning around `542 kB`; this is not an outage but can be improved later with code splitting.
- PM2 process supervision is operational, but there is not yet a separate external uptime alert in this repo.
