ALTER TABLE "SendJob" ADD COLUMN "logicalKey" TEXT NOT NULL DEFAULT '';

UPDATE "SendJob"
SET "logicalKey" = 'legacy:' || "id"
WHERE "logicalKey" = '';

CREATE UNIQUE INDEX "SendJob_userId_logicalKey_key" ON "SendJob"("userId", "logicalKey");
