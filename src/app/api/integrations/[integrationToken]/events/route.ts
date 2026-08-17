import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptCredentials } from "@/lib/crypto";
import { createEvent } from "@/lib/events";
import { normalizeCommerceEvent, verifyCommerceSignature, verifyShopifyHmac } from "@/lib/commerce";
import { consumeRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request, { params }: { params: Promise<{ integrationToken: string }> }) {
  const { integrationToken } = await params;
  const integration = await prisma.integrationConnection.findUnique({ where: { publicToken: integrationToken } });
  if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  const rate = await consumeRateLimit(`commerce:${integration.id}`, 600, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit exceeded", resetAt: rate.resetAt.toISOString() }, { status: 429 });
  const raw = await req.text();
  let secret: string;
  try { secret = decryptCredentials(integration.secretEncrypted); } catch { return NextResponse.json({ error: "Integration secret unavailable" }, { status: 500 }); }
  let valid = verifyCommerceSignature(raw, req.headers.get("x-commerce-signature"), secret);
  if (integration.provider === "shopify" && integration.webhookSecretEncrypted) {
    try { const webhookSecret = decryptCredentials(integration.webhookSecretEncrypted); valid = verifyShopifyHmac(raw, req.headers.get("x-shopify-hmac-sha256"), webhookSecret) || valid; } catch { /* keep fallback */ }
  }
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const event = normalizeCommerceEvent(integration.provider as "shopify" | "woocommerce", payload, req.headers.get("x-commerce-topic") ?? undefined);
    if (!event) return NextResponse.json({ ok: true, ignored: true });
    const result = await createEvent({ userId: integration.userId, type: event.type, email: event.email, properties: event.properties, idempotencyKey: `${integration.id}:${event.type}:${event.externalId ?? raw.length}`, occurredAt: event.occurredAt });
    await prisma.integrationConnection.update({ where: { id: integration.id }, data: { eventCount: { increment: 1 }, lastEventAt: new Date(), lastError: null } });
    return NextResponse.json({ ok: true, type: event.type, created: result.created, enrollments: result.enrollments });
  } catch (error) { await prisma.integrationConnection.update({ where: { id: integration.id }, data: { lastError: error instanceof Error ? error.message.slice(0, 1000) : "Invalid payload" } }); return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 }); }
}
