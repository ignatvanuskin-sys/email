import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export function verifySignedWebhook(req: Request, rawBody: string): boolean {
  const timestamp = req.headers.get("x-clipreach-timestamp") ?? "";
  const signature = req.headers.get("x-clipreach-signature") ?? "";
  const secret = env.BOUNCE_WEBHOOK_SECRET;
  if (!secret || !timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("base64url");
  const provided = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);
}

export function computeWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("base64url");
}
