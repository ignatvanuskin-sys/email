import { createHash } from "node:crypto";
import { createUnsubscribeToken, parseUnsubscribeToken } from "./webhookSecurity";

export function createTrackingToken(userId: string, emailId: string): string {
  return createUnsubscribeToken(userId, emailId);
}

export function parseTrackingToken(token: string): { userId: string; emailId: string } | null {
  const parsed = parseUnsubscribeToken(token);
  return parsed ? { userId: parsed.userId, emailId: parsed.messageId } : null;
}

export function hashIp(ip: string | null): string | null {
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
}

export function trackingPixel(): string {
  return Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;", "binary").toString("base64");
}
