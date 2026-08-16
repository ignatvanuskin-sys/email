import { prisma } from "./prisma";
import { NextResponse } from "next/server";

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export async function consumeRateLimit(key: string, limit: number, windowMs: number, now = new Date()): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const windowKey = String(Math.floor(now.getTime() / windowMs));
  const expiresAt = new Date((Number(windowKey) + 1) * windowMs);
  const current = await prisma.rateLimitCounter.findUnique({ where: { key_windowKey: { key, windowKey } } });
  if ((current?.count ?? 0) >= limit) return { allowed: false, remaining: 0, resetAt: current?.expiresAt ?? expiresAt };
  const updated = await prisma.rateLimitCounter.upsert({ where: { key_windowKey: { key, windowKey } }, create: { key, windowKey, count: 1, expiresAt }, update: { count: { increment: 1 } } });
  return { allowed: true, remaining: Math.max(0, limit - updated.count), resetAt: expiresAt };
}

// Compatibility adapter for callers that only need a boolean decision.
export function rateLimit(req: Request, key: string, limit = 60, windowMs = 60_000): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const current = memoryBuckets.get(bucketKey);
  if (!current || current.resetAt <= now) { memoryBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs }); return null; }
  current.count++;
  if (current.count <= limit) return null;
  return NextResponse.json({ error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) }, { status: 429, headers: { "retry-after": String(Math.ceil((current.resetAt - now) / 1000)) } });
}
