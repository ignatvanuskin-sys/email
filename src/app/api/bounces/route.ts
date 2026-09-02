import { NextResponse } from "next/server";
import { z } from "zod";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { processSuppressionEvent } from "@/lib/emailEvents";
import { verifySignature } from "@/lib/webhookSecurity";

const schema = z.object({
  eventId: z.string().min(1).max(300).optional(),
  email: z.string().email().optional(),
  emailMessageId: z.string().optional(),
  event: z.enum(["bounce", "complaint"]),
});

function isValidSignature(raw: string, req: Request): boolean {
  const sig = req.headers.get("x-clipreach-signature");
  if (verifySignature(raw, sig)) return true;
  // Legacy smoke path: base64url HMAC of timestamp.body using BOUNCE_WEBHOOK_SECRET
  const timestamp = req.headers.get("x-clipreach-timestamp");
  const legacySecret = env.BOUNCE_WEBHOOK_SECRET || env.WEBHOOK_SECRET;
  if (timestamp && sig && legacySecret) {
    try {
      const expected = createHmac("sha256", legacySecret).update(`${timestamp}.${raw}`).digest("base64url");
      if (sig === expected) return true;
      // Also accept hex vs base64url interchange for leniency
      const expectedHex = createHmac("sha256", legacySecret).update(`${timestamp}.${raw}`).digest("hex");
      if (sig.toLowerCase() === expectedHex.toLowerCase()) return true;
    } catch {}
  }
  // Also try raw body HMAC with BOUNCE secret as hex (alternative)
  if (sig && legacySecret) {
    try {
      const hex = createHmac("sha256", legacySecret).update(raw).digest("hex");
      if (sig.toLowerCase() === hex.toLowerCase()) return true;
      const b64 = createHmac("sha256", legacySecret).update(raw).digest("base64url");
      if (sig === b64) return true;
    } catch {}
  }
  return false;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!isValidSignature(raw, req)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  try {
    const data = schema.parse(JSON.parse(raw));
    const providerEventId = data.eventId ?? data.emailMessageId ?? `bounce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await processSuppressionEvent({ providerEventId, type: data.event, email: data.email, emailMessageId: data.emailMessageId, payload: data });
    return NextResponse.json({ ok: true, processed: result.processed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook payload" }, { status: 400 });
  }
}
