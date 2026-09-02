import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyStripeLikeSignature } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { applyVerifiedSubscription, cancelSubscriptionEntitlement } from "@/lib/billing";
import type { PlanName } from "@/lib/usage";

const SUPPORTED_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);
const PAID_PLANS = new Set<PlanName>(["Pro", "Agency"]);

type StripeEvent = {
  id?: unknown;
  type?: unknown;
  data?: { object?: Record<string, unknown> };
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function planFromSubscription(object: Record<string, unknown>): PlanName | undefined {
  const items = object.items as { data?: Array<{ price?: { id?: unknown } }> } | undefined;
  const priceId = stringValue(items?.data?.[0]?.price?.id);
  if (priceId && env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) return "Pro";
  if (priceId && env.STRIPE_PRICE_AGENCY && priceId === env.STRIPE_PRICE_AGENCY) return "Agency";
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const metadataPlan = stringValue(metadata.plan);
  return metadataPlan === "Free" || PAID_PLANS.has(metadataPlan as PlanName) ? metadataPlan as PlanName : undefined;
}

function currentPeriodEnd(object: Record<string, unknown>): Date | null {
  const seconds = Number(object.current_period_end);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

async function claimEvent(eventId: string, eventType: string) {
  try {
    return { record: await prisma.billingWebhookEvent.create({ data: { id: eventId, type: eventType } }), duplicate: false };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Unique constraint")) throw error;
    const existing = await prisma.billingWebhookEvent.findUnique({ where: { id: eventId } });
    if (existing?.processedAt) return { record: existing, duplicate: true };
    if (existing?.status === "processing" && Date.now() - existing.receivedAt.getTime() < 5 * 60 * 1000) return { record: existing, duplicate: true };
    const claimed = await prisma.billingWebhookEvent.updateMany({ where: { id: eventId, status: { not: "processed" } }, data: { type: eventType, status: "processing", receivedAt: new Date() } });
    if (claimed.count !== 1) return { record: existing, duplicate: true };
    return { record: await prisma.billingWebhookEvent.findUniqueOrThrow({ where: { id: eventId } }), duplicate: false };
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !verifyStripeLikeSignature(raw, req.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid billing signature" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid billing event" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const eventId = stringValue(event.id);
  const eventType = stringValue(event.type) ?? "unknown";
  if (!eventId) return NextResponse.json({ error: "Invalid billing event" }, { status: 400, headers: { "cache-control": "no-store" } });

  try {
    const claim = await claimEvent(eventId, eventType);
    if (claim.duplicate) return NextResponse.json({ ok: true, duplicate: true }, { headers: { "cache-control": "no-store" } });

    const object = event.data?.object ?? {};
    if (SUPPORTED_EVENTS.has(eventType)) {
      const metadata = (object.metadata ?? {}) as Record<string, unknown>;
      const metadataUserId = stringValue(metadata.userId);
      const customerId = stringValue(object.customer);
      const stripeSubscriptionId = stringValue(object.id);
      const knownByCustomer = customerId ? await prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } }) : null;
      const knownByUser = metadataUserId ? await prisma.subscription.findUnique({ where: { userId: metadataUserId } }) : null;
      if (knownByCustomer && knownByUser && knownByCustomer.userId !== knownByUser.userId) {
        await prisma.billingWebhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date() } });
        return NextResponse.json({ ok: true, ignored: true }, { headers: { "cache-control": "no-store" } });
      }
      const subscription = knownByCustomer ?? knownByUser;
      if (!subscription || !customerId || !stripeSubscriptionId) {
        await prisma.billingWebhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date() } });
        return NextResponse.json({ ok: true, ignored: true }, { headers: { "cache-control": "no-store" } });
      }
      if ((subscription.stripeCustomerId && subscription.stripeCustomerId !== customerId) || (subscription.stripeSubscriptionId && subscription.stripeSubscriptionId !== stripeSubscriptionId)) {
        await prisma.billingWebhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date() } });
        return NextResponse.json({ ok: true, ignored: true }, { headers: { "cache-control": "no-store" } });
      }
      if (eventType === "customer.subscription.deleted") await cancelSubscriptionEntitlement(subscription.userId);
      else {
        const plan = planFromSubscription(object);
        if (!plan) {
          await prisma.billingWebhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date() } });
          return NextResponse.json({ ok: true, ignored: true }, { headers: { "cache-control": "no-store" } });
        }
        await applyVerifiedSubscription({
          userId: subscription.userId,
          plan,
          status: stringValue(object.status) ?? "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId,
          currentPeriodEnd: currentPeriodEnd(object),
          cancelAtPeriodEnd: object.cancel_at_period_end === true,
        });
      }
    }
    await prisma.billingWebhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date() } });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    try { await prisma.billingWebhookEvent.update({ where: { id: eventId }, data: { status: "failed" } }); } catch { /* preserve generic response */ }
    return NextResponse.json({ error: "Invalid billing event" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
