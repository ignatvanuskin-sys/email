import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function signValue(value: string): string {
  return createHmac("sha256", env.WEBHOOK_SECRET).update(value).digest("hex");
}

export function verifySignature(value: string, signature: string | null): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(signValue(value), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createUnsubscribeToken(userId: string, messageId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, messageId })).toString("base64url");
  return `${payload}.${signValue(payload)}`;
}

export function parseUnsubscribeToken(token: string): { userId: string; messageId: string } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !verifySignature(payload, signature ?? null)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof data.userId === "string" && typeof data.messageId === "string" ? { userId: data.userId, messageId: data.messageId } : null;
  } catch {
    return null;
  }
}
