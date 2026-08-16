import { NextResponse } from "next/server";
import { z } from "zod";
import { processSuppressionEvent } from "@/lib/emailEvents";
import { verifySignature } from "@/lib/webhookSecurity";

const schema = z.object({
  eventId: z.string().min(1).max(300),
  email: z.string().email().optional(),
  emailMessageId: z.string().optional(),
  event: z.enum(["bounce", "complaint"]),
});

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-clipreach-signature"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  try {
    const data = schema.parse(JSON.parse(raw));
    const result = await processSuppressionEvent({ providerEventId: data.eventId, type: data.event, email: data.email, emailMessageId: data.emailMessageId, payload: data });
    return NextResponse.json({ ok: true, processed: result.processed });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook payload" }, { status: 400 });
  }
}
