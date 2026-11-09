-- Matching engine: readiness fields, decisions, matches, blocks, reports.
CREATE TYPE "WorkStudySchedule" AS ENUM ('DAYTIME', 'EVENING', 'NIGHT', 'ROTATING', 'FLEXIBLE');
CREATE TYPE "DecisionKind" AS ENUM ('LIKE', 'PASS');
CREATE TYPE "ReportReason" AS ENUM ('HARASSMENT', 'SCAM', 'FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACTIONED', 'DISMISSED');

ALTER TABLE "users"
  ADD COLUMN "matchingEnabledAt" TIMESTAMPTZ(3),
  ADD COLUMN "suspendedAt" TIMESTAMPTZ(3);

ALTER TABLE "housing_preferences" ADD COLUMN "moveInLatestDate" DATE;
ALTER TABLE "housing_preferences" ADD CONSTRAINT "housing_move_in_window_chk"
  CHECK ("moveInLatestDate" IS NULL OR ("moveInDate" IS NOT NULL AND "moveInLatestDate" >= "moveInDate"));

ALTER TABLE "lifestyle_preferences"
  ADD COLUMN "workStudySchedule" "WorkStudySchedule",
  ADD COLUMN "acceptedWorkStudySchedules" "WorkStudySchedule"[] NOT NULL DEFAULT ARRAY[]::"WorkStudySchedule"[];

CREATE TABLE "discovery_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "kind" "DecisionKind" NOT NULL,
  "invalidatedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discovery_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discovery_actions_no_self_chk" CHECK ("actorId" <> "targetId")
);
CREATE UNIQUE INDEX "discovery_actions_actorId_targetId_key" ON "discovery_actions"("actorId", "targetId");
CREATE INDEX "discovery_actions_targetId_idx" ON "discovery_actions"("targetId");
ALTER TABLE "discovery_actions" ADD CONSTRAINT "discovery_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovery_actions" ADD CONSTRAINT "discovery_actions_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userLowId" UUID NOT NULL,
  "userHighId" UUID NOT NULL,
  "scoreAtMatch" INTEGER NOT NULL,
  "scorePolicy" VARCHAR(40) NOT NULL,
  "endedAt" TIMESTAMPTZ(3),
  "endedById" UUID,
  "endReason" VARCHAR(20),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "matches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "matches_canonical_pair_chk" CHECK ("userLowId" < "userHighId"),
  CONSTRAINT "matches_score_chk" CHECK ("scoreAtMatch" BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX "matches_userLowId_userHighId_key" ON "matches"("userLowId", "userHighId");
CREATE INDEX "matches_userHighId_idx" ON "matches"("userHighId");
ALTER TABLE "matches" ADD CONSTRAINT "matches_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blockerId" UUID NOT NULL,
  "blockedId" UUID NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_blocks_no_self_chk" CHECK ("blockerId" <> "blockedId")
);
CREATE UNIQUE INDEX "user_blocks_blockerId_blockedId_key" ON "user_blocks"("blockerId", "blockedId");
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporterId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "reason" "ReportReason" NOT NULL,
  "details" VARCHAR(1000),
  "matchId" UUID,
  "listingId" UUID,
  "snapshot" JSONB,
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_reports_no_self_chk" CHECK ("reporterId" <> "targetId")
);
CREATE INDEX "user_reports_status_createdAt_idx" ON "user_reports"("status", "createdAt");
CREATE INDEX "user_reports_targetId_idx" ON "user_reports"("targetId");
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
