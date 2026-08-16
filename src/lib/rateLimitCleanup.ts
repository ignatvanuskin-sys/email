import { prisma } from "./prisma";

export async function cleanupExpiredRateLimits(now = new Date()): Promise<number> {
  const result = await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}
