import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decryptCredentials } from "@/lib/crypto";
import { createEvent } from "@/lib/events";
import { normalizeCommerceEvent, verifyCommerceSignature, verifyShopifyHmac } from "@/lib/commerce";
import { consumeRateLimit } from "@/lib/rateLimit";

export async function POST(req: Request, { params }: { params: Promise<{ integration: string }> }) {
  const { integration: integrationToken } = await params;
  const integration = await prisma.integrationConnection.findUnique({ where: { publicToken: integrationToken } });
  if (!integration) return apiError("Integration not found", 404, "INTEGRATION_NOT_FOUND");
  const rate = await consumeRateLimit(`commerce:${integration.id}`, 600, 60_000);
  if (!rate.allowed) return apiError("Rate limit exceeded", 429, "RATE_LIMITED");
  const raw = await req.text();
  let secret: string;
  try { secret = decryptCredentials(integration.secretEncrypted); } catch { return NextResponse.json({ error: "Integration secret unavailable" }, { status: 500 }); }
  let valid = verifyCommerceSignature(raw, req.headers.get("x-commerce-signature"), secret);
  if (integration.provider === "shopify" && integration.webhookSecretEncrypted) {
    try { const webhookSecret = decryptCredentials(integration.webhookSecretEncrypted); valid = verifyShopifyHmac(raw, req.headers.get("x-shopify-hmac-sha256"), webhookSecret) || valid; } catch { /* keep fallback */ }
  }
  if (!valid) return apiError("Invalid signature", 401, "INVALID_SIGNATURE");
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const event = normalizeCommerceEvent(integration.provider as "shopify" | "woocommerce", payload, req.headers.get("x-commerce-topic") ?? undefined);
    if (!event) return NextResponse.json({ ok: true, ignored: true });
    const providerEventId = (req.headers.get("x-commerce-event-id") ?? req.headers.get("x-shopify-webhook-id") ?? event.externalId ?? "").trim();
    if (!providerEventId || providerEventId.length > 200) return apiError("Provider event ID is required", 400, "PROVIDER_EVENT_ID_REQUIRED");
    const result = await createEvent({ userId: integration.userId, type: event.type, email: event.email, properties: event.properties, idempotencyKey: `${integration.id}:${providerEventId}`, occurredAt: event.occurredAt });
    await prisma.integrationConnection.update({ where: { id: integration.id }, data: { eventCount: { increment: 1 }, lastEventAt: new Date(), lastError: null } });
    return NextResponse.json({ ok: true, type: event.type, created: result.created, enrollments: result.enrollments });
  } catch (error) {
    console.error("[integration-event-error]", { integrationId: integration.id, error });
    await prisma.integrationConnection.update({ where: { id: integration.id }, data: { lastError: "INTEGRATION_EVENT_INVALID" } });
    return apiError("Invalid integration event", 400, "INTEGRATION_EVENT_INVALID");
  }
}

