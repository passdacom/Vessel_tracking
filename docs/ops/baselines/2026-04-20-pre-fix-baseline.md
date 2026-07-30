# 2026-04-20 Pre-Fix 운영 기준선

## Git 기준선

- Project path: `/root/.openclaw/workspace/Vessel_tracking`
- Branch: `claude/add-war-risk-areas-3y4LA`
- HEAD: `2875126be31f0580b8d971bcc16d71bb7ea93b8a`
- Existing working tree changes were present before this safety pass.

Existing modified/untracked paths at baseline:

```text
 M CLAUDE.md
 M README.md
 M _workspace/00_input.md
 M _workspace/01_style_review.md
 M _workspace/02_security_review.md
 M _workspace/03_performance_review.md
 M _workspace/04_architecture_review.md
 M _workspace/05_review_summary.md
 M frontend/src/components/Sidebar/VesselCard.jsx
 M frontend/src/components/Sidebar/index.jsx
 M frontend/src/utils/etaCalc.js
?? .graphifyignore
?? AGENTS.md
?? graphify-out/
```

## Runtime 기준선

Docker:

```text
vessel_tracking-postgres-1   postgres:16-alpine   Up 11 days (healthy)
```

PM2:

```text
vessel-backend    online   pid 3540146   uptime 22h   restarts 10
vessel-frontend   online   pid 4089612   uptime 4h    restarts 9
```

Disk:

```text
/dev/loop2   69G total   53G used   14G available   80%
```

Database logical size:

```text
vessel_tracking: 12 MB
```

## DB 백업

- Backup file: `/root/.openclaw/backups/vessel_tracking/vessel_tracking_20260420_064944_pre_fix.dump`
- Backup size: `326K`
- Verification: `pg_restore -l` listing succeeded inside `vessel_tracking-postgres-1`
- TOC/listing lines: `112`
- Archive metadata: created at `2026-04-20 06:49:44 UTC`, compression `gzip`

## Notes

- No app process was restarted during this safety pass.
- No schema or production data changes were made.
- The backup path is outside the project repository and is not tracked by git.

## Follow-up Schema Change

During the share-ownership update, `npx prisma db push` was intentionally not used because Prisma reported it would drop the existing non-empty `VesselAccount` table. The data-loss prompt was rejected.

The required additive change was applied manually instead:

```sql
ALTER TABLE "SharedView" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
CREATE INDEX IF NOT EXISTS "SharedView_createdBy_idx" ON "SharedView"("createdBy");
```

Verification:

```text
column_name | data_type | is_nullable
createdBy   | text      | YES
```
