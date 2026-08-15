import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type UnsubscribePayload = {
  userId: string;
  leadId: string;
  email: string;
  exp: number;
};

function sign(encodedPayload: string): string {
  if (!env.UNSUBSCRIBE_SECRET) throw new Error("UNSUBSCRIBE_SECRET is not configured");
  return createHmac("sha256", env.UNSUBSCRIBE_SECRET).update(encodedPayload).digest("base64url");
}

export function createUnsubscribeToken(userId: string, leadId: string, email: string): string {
  const payload: UnsubscribePayload = {
    userId,
    leadId,
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  const [encoded, providedSignature] = token.split(".");
  if (!encoded || !providedSignature || !env.UNSUBSCRIBE_SECRET) return null;
  const expectedSignature = sign(encoded);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as UnsubscribePayload;
    if (!payload.userId || !payload.leadId || !payload.email || !Number.isInteger(payload.exp)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(appUrl: string, userId: string, leadId: string, email: string): string {
  const token = createUnsubscribeToken(userId, leadId, email);
  return `${appUrl.replace(/\/$/, "")}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function ensureUnsubscribeFooter(body: string, appUrl: string, userId: string, leadId: string, email: string): string {
  if (body.includes("/api/unsubscribe?token=")) return body;
  return `${body.trim()}\n\n---\nDon't want to receive these emails? Unsubscribe: ${unsubscribeUrl(appUrl, userId, leadId, email)}`;
}
