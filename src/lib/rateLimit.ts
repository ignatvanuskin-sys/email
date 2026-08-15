import { NextResponse } from "next/server";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function requestIdentity(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown-client";
}

export function rateLimit(req: Request, key: string, limit: number, windowMs: number): NextResponse | null {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  const bucketKey = `${key}:${requestIdentity(req)}`;
  const current = buckets.get(bucketKey);
  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) },
    });
  }
  current.count++;
  return null;
}
