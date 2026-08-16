import { prisma } from "./prisma";

export async function consumeRateLimit(key: string, limit: number, windowMs: number, now = new Date()): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const windowKey = String(Math.floor(now.getTime() / windowMs));
  const expiresAt = new Date((Number(windowKey) + 1) * windowMs);
  const current = await prisma.rateLimitCounter.findUnique({ where: { key_windowKey: { key, windowKey } } });
  if ((current?.count ?? 0) >= limit) return { allowed: false, remaining: 0, resetAt: current?.expiresAt ?? expiresAt };
  const updated = await prisma.rateLimitCounter.upsert({ where: { key_windowKey: { key, windowKey } }, create: { key, windowKey, count: 1, expiresAt }, update: { count: { increment: 1 } } });
  return { allowed: true, remaining: Math.max(0, limit - updated.count), resetAt: expiresAt };
}
