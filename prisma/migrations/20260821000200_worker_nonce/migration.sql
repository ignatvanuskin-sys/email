-- Persist one-time worker nonces so HMAC-authenticated requests cannot be replayed.
CREATE TABLE "WorkerNonce" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerNonce_pkey" PRIMARY KEY ("nonce")
);
CREATE INDEX "WorkerNonce_expiresAt_idx" ON "WorkerNonce"("expiresAt");
