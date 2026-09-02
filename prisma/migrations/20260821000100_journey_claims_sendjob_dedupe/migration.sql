-- Add nullable coordination metadata without changing existing rows or send states.
ALTER TABLE "JourneyEnrollment" ADD COLUMN "claimToken" TEXT;
ALTER TABLE "JourneyEnrollment" ADD COLUMN "claimUntil" TIMESTAMP(3);

ALTER TABLE "SendJob" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "SendJob_dedupeKey_key" ON "SendJob"("dedupeKey");

-- Existing rows remain claimable and dedupeKey-null; future writers can opt into
-- atomic claim and idempotent enqueue semantics without a destructive backfill.
