-- CreateTable
CREATE TABLE "Vessel" (
    "id" SERIAL NOT NULL,
    "mmsi" TEXT NOT NULL,
    "name" TEXT,
    "alias" TEXT,
    "account" TEXT NOT NULL DEFAULT 'kb',
    "companyType" TEXT NOT NULL DEFAULT '자사간사',
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "imo" TEXT,
    "callsign" TEXT,
    "countryIso" TEXT,
    "countryName" TEXT,
    "vesselType" TEXT,
    "typeSpecific" TEXT,
    "grossTonnage" INTEGER,
    "deadweight" INTEGER,
    "length" DOUBLE PRECISION,
    "breadth" DOUBLE PRECISION,
    "yearBuilt" TEXT,
    "homePort" TEXT,
    "speedAvg" DOUBLE PRECISION,
    "speedMax" DOUBLE PRECISION,
    "infoFetched" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "vesselId" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "cog" DOUBLE PRECISION,
    "sog" DOUBLE PRECISION,
    "heading" INTEGER,
    "navStatus" TEXT,
    "destination" TEXT,
    "eta" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "impliedSpeed" DOUBLE PRECISION,
    "spoofReason" TEXT,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "vesselName" TEXT NOT NULL,
    "incidentType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "cargo" TEXT,
    "crew" TEXT,
    "description" TEXT,
    "link" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Port" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nameKo" TEXT,
    "unlocode" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "vesselLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselAccount" (
    "id" SERIAL NOT NULL,
    "vesselId" INTEGER NOT NULL,
    "account" TEXT NOT NULL,
    "alias" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "companyType" TEXT NOT NULL DEFAULT '자사간사',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VesselAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 1,
    "account" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneEvent" (
    "id" SERIAL NOT NULL,
    "vesselId" INTEGER NOT NULL,
    "zoneName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "posTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoneEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedView" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "vesselIds" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SharedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingLane" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coordinates" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#f59e0b',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingLane_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vessel_account_idx" ON "Vessel"("account");

-- CreateIndex
CREATE INDEX "Vessel_active_idx" ON "Vessel"("active");

-- CreateIndex
CREATE INDEX "Vessel_infoFetched_idx" ON "Vessel"("infoFetched");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_account_mmsi_key" ON "Vessel"("account", "mmsi");

-- CreateIndex
CREATE INDEX "Position_vesselId_timestamp_idx" ON "Position"("vesselId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Position_vesselId_suspicious_timestamp_idx" ON "Position"("vesselId", "suspicious", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Position_vesselId_timestamp_key" ON "Position"("vesselId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Port_unlocode_key" ON "Port"("unlocode");

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE INDEX "VesselAccount_account_idx" ON "VesselAccount"("account");

-- CreateIndex
CREATE UNIQUE INDEX "VesselAccount_vesselId_account_key" ON "VesselAccount"("vesselId", "account");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "ApiUsage_createdAt_idx" ON "ApiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "ApiUsage_account_idx" ON "ApiUsage"("account");

-- CreateIndex
CREATE INDEX "ZoneEvent_vesselId_posTimestamp_idx" ON "ZoneEvent"("vesselId", "posTimestamp" DESC);

-- CreateIndex
CREATE INDEX "ZoneEvent_vesselId_zoneName_createdAt_idx" ON "ZoneEvent"("vesselId", "zoneName", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ZoneEvent_createdAt_idx" ON "ZoneEvent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ZoneEvent_eventType_idx" ON "ZoneEvent"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "SharedView_token_key" ON "SharedView"("token");

-- CreateIndex
CREATE INDEX "SharedView_createdBy_idx" ON "SharedView"("createdBy");

-- CreateIndex
CREATE INDEX "SharedView_expiresAt_idx" ON "SharedView"("expiresAt");

-- CreateIndex
CREATE INDEX "ShippingLane_active_idx" ON "ShippingLane"("active");

-- CreateIndex
CREATE INDEX "ShippingLane_createdAt_idx" ON "ShippingLane"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselAccount" ADD CONSTRAINT "VesselAccount_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoneEvent" ADD CONSTRAINT "ZoneEvent_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
