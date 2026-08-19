import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function hmac(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(provided: string, expected: string): boolean {
  const actualBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function signValue(value: string, secret = env.WEBHOOK_SECRET): string {
  if (!secret) throw new Error("Webhook signing secret is not configured");
  return hmac(value, secret);
}

export function verifySignature(value: string, signature: string | null, secret = env.WEBHOOK_SECRET): boolean {
  if (!signature || !secret || !/^[A-Za-z0-9_-]{43}$/u.test(signature)) return false;
  return safeEqual(signature, hmac(value, secret));
}

export function signBouncePayload(timestamp: string, rawBody: string): string {
  if (!env.BOUNCE_WEBHOOK_SECRET) throw new Error("Bounce webhook secret is not configured");
  return hmac(`${timestamp}.${rawBody}`, env.BOUNCE_WEBHOOK_SECRET);
}

export function verifyBounceSignature(rawBody: string, timestamp: string | null, signature: string | null, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!timestamp || !signature || !env.BOUNCE_WEBHOOK_SECRET) return false;
  const parsedTimestamp = Number(timestamp);
  if (!Number.isInteger(parsedTimestamp) || Math.abs(nowSeconds - parsedTimestamp) > toleranceSeconds) return false;
  return safeEqual(signature, signBouncePayload(timestamp, rawBody));
}

export function createUnsubscribeToken(userId: string, messageId: string): string {
  if (!env.UNSUBSCRIBE_SECRET) throw new Error("Unsubscribe secret is not configured");
  const payload = Buffer.from(JSON.stringify({ userId, messageId, exp: Math.floor(Date.now() / 1000) + UNSUBSCRIBE_TOKEN_TTL_SECONDS })).toString("base64url");
  return `${payload}.${hmac(payload, env.UNSUBSCRIBE_SECRET)}`;
}

export function parseUnsubscribeToken(token: string): { userId: string; messageId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !env.UNSUBSCRIBE_SECRET) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !safeEqual(signature, hmac(payload, env.UNSUBSCRIBE_SECRET))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof data.userId !== "string" || typeof data.messageId !== "string" || !Number.isInteger(data.exp)) return null;
    if ((data.exp as number) < Math.floor(Date.now() / 1000)) return null;
    return { userId: data.userId, messageId: data.messageId };
  } catch {
    return null;
  }
}
