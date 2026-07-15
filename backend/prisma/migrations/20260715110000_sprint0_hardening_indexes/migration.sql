-- Additive hot-query indexes. IF NOT EXISTS keeps this safe after baselining an existing database.
CREATE INDEX IF NOT EXISTS "Vessel_active_idx" ON "Vessel"("active");
CREATE INDEX IF NOT EXISTS "Vessel_infoFetched_idx" ON "Vessel"("infoFetched");
CREATE INDEX IF NOT EXISTS "Position_vesselId_suspicious_timestamp_idx"
  ON "Position"("vesselId", "suspicious", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "ZoneEvent_vesselId_zoneName_createdAt_idx"
  ON "ZoneEvent"("vesselId", "zoneName", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SharedView_expiresAt_idx" ON "SharedView"("expiresAt");
