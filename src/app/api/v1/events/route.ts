import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/apiKeys";
import { prisma } from "@/lib/prisma";
import { createEvent } from "@/lib/events";
import { consumeUsage } from "@/lib/usage";
import { consumeRateLimit } from "@/lib/rateLimit";

const schema = z.object({
  type: z.string().trim().min(1).max(120),
  contactId: z.string().optional(),
  email: z.string().email().optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  occurredAt: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  const user = await authenticateApiKey(req, "events:write");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await consumeRateLimit(`api:events:${user.id}`, 300, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit exceeded", resetAt: rate.resetAt.toISOString() }, { status: 429 });
  try {
    const data = schema.parse(await req.json());
    if (!data.contactId && !data.email) return apiError("contactId or email is required", 400, "EVENT_CONTACT_REQUIRED");
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    if (idempotencyKey) {
      const existing = await prisma.event.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } } });
      if (existing) {
        return NextResponse.json({ event: { id: existing.id, type: existing.type, createdAt: existing.createdAt.toISOString() }, created: false, enrollments: [] }, { status: 200 });
      }
    }
    const usage = await consumeUsage(user.id, "apiEvents");
    if (!usage.allowed) return NextResponse.json({ error: "API event limit reached", code: "QUOTA_EXCEEDED", usage }, { status: 429 });
    const result = await createEvent({ userId: user.id, type: data.type, leadId: data.contactId, email: data.email, properties: data.properties, idempotencyKey, occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined });
    return NextResponse.json({ event: { id: result.event.id, type: result.event.type, createdAt: result.event.createdAt.toISOString() }, created: result.created, enrollments: result.enrollments }, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("[api-events-error]", { error });
    return apiError("Invalid request", 400, "BAD_REQUEST");
  }
}
