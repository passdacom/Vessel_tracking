/**
 * Safe DB migration script
 * - Adds missing columns to Vessel table (alias, account, companyType)
 * - Migrates account data from VesselAccount table
 * - Ensures ZoneEvent table exists
 * Run: node migrate.mjs
 */

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

async function run() {
  console.log("=== DB Migration ===");

  // 1. 현재 Vessel 테이블 컬럼 확인
  const cols = await p.$queryRaw`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Vessel'
    ORDER BY ordinal_position
  `;
  console.log("\n[현재 Vessel 컬럼]");
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable}, default: ${c.column_default})`));

  // 2. alias 컬럼 추가
  const hasAlias = cols.some(c => c.column_name === "alias");
  if (!hasAlias) {
    await p.$executeRawUnsafe(`ALTER TABLE "Vessel" ADD COLUMN IF NOT EXISTS "alias" TEXT`);
    console.log("\n✅ alias 컬럼 추가됨");
  } else {
    console.log("\n✓ alias 컬럼 이미 존재");
  }

  // 3. account 컬럼 추가
  const hasAccount = cols.some(c => c.column_name === "account");
  if (!hasAccount) {
    await p.$executeRawUnsafe(`ALTER TABLE "Vessel" ADD COLUMN IF NOT EXISTS "account" TEXT NOT NULL DEFAULT 'kb'`);
    console.log("✅ account 컬럼 추가됨 (기본값: 'kb')");
  } else {
    console.log("✓ account 컬럼 이미 존재");
  }

  // 4. companyType 컬럼 추가
  const hasCompanyType = cols.some(c => c.column_name === "companyType");
  if (!hasCompanyType) {
    await p.$executeRawUnsafe(`ALTER TABLE "Vessel" ADD COLUMN IF NOT EXISTS "companyType" TEXT NOT NULL DEFAULT '자사간사'`);
    console.log("✅ companyType 컬럼 추가됨 (기본값: '자사간사')");
  } else {
    console.log("✓ companyType 컬럼 이미 존재");
  }

  // 5. VesselAccount 테이블 확인 및 데이터 마이그레이션
  const tables = await p.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const tableNames = tables.map(t => t.table_name);
  console.log("\n[현재 테이블 목록]", tableNames.join(", "));

  if (tableNames.includes("VesselAccount")) {
    const vaCols = await p.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'VesselAccount'
    `;
    console.log("\n[VesselAccount 컬럼]", vaCols.map(c => c.column_name).join(", "));

    const vaRows = await p.$queryRaw`SELECT * FROM "VesselAccount" LIMIT 5`;
    console.log("[VesselAccount 샘플]", JSON.stringify(vaRows, null, 2));

    // account 컬럼 마이그레이션 시도
    if (!hasAccount) {
      try {
        // VesselAccount에서 accountId 또는 account 컬럼으로 마이그레이션
        const accountCol = vaCols.find(c => ["account", "accountId", "accountName"].includes(c.column_name));
        if (accountCol) {
          const migrated = await p.$executeRawUnsafe(`
            UPDATE "Vessel" v
            SET "account" = va."${accountCol.column_name}"
            FROM "VesselAccount" va
            WHERE va."vesselId" = v."id"
          `);
          console.log(`✅ VesselAccount → Vessel.account 마이그레이션 (${migrated}개 레코드)`);
        }
      } catch (e) {
        console.log("⚠ account 마이그레이션 실패:", e.message);
      }
    }
  }

  // 6. account 인덱스 생성
  try {
    await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Vessel_account_idx" ON "Vessel" ("account")`);
    console.log("✅ Vessel.account 인덱스 생성");
  } catch (e) {
    console.log("⚠ 인덱스 생성:", e.message);
  }

  // 7. ZoneEvent 테이블 생성
  if (!tableNames.includes("ZoneEvent")) {
    await p.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ZoneEvent" (
        "id" SERIAL PRIMARY KEY,
        "vesselId" INTEGER NOT NULL,
        "zoneName" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "lat" DOUBLE PRECISION NOT NULL,
        "lon" DOUBLE PRECISION NOT NULL,
        "posTimestamp" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ZoneEvent_vesselId_fkey"
          FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ZoneEvent_vesselId_posTimestamp_idx" ON "ZoneEvent" ("vesselId", "posTimestamp" DESC)`);
    await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ZoneEvent_createdAt_idx" ON "ZoneEvent" ("createdAt" DESC)`);
    await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ZoneEvent_eventType_idx" ON "ZoneEvent" ("eventType")`);
    console.log("✅ ZoneEvent 테이블 생성");
  } else {
    console.log("✓ ZoneEvent 테이블 이미 존재");
  }

  // 8. 최종 Vessel 컬럼 확인
  const finalCols = await p.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Vessel'
    ORDER BY ordinal_position
  `;
  console.log("\n[마이그레이션 후 Vessel 컬럼]", finalCols.map(c => c.column_name).join(", "));

  console.log("\n=== 마이그레이션 완료 ===");
  await p.$disconnect();
}

run().catch(e => { console.error("Migration error:", e); process.exit(1); });
