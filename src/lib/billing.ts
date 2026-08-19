import { prisma } from "./prisma";
import { PLAN_LIMITS, type PlanName } from "./usage";

export const PLAN_CATALOG = [
  { id: "Free", name: "Free", priceMonthly: 0, limits: PLAN_LIMITS.Free },
  { id: "Pro", name: "Pro", priceMonthly: 49, limits: PLAN_LIMITS.Pro },
  { id: "Agency", name: "Agency", priceMonthly: 149, limits: PLAN_LIMITS.Agency },
] as const;

export async function getSubscription(userId: string) {
  return prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: "Free", status: "active" },
    update: {},
  });
}

/**
 * Paid entitlements may only be written after a verified billing provider event.
 * This function must never be called from a client-authenticated route.
 */
export async function applyVerifiedSubscription(input: {
  userId: string;
  plan: PlanName;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}) {
  return prisma.subscription.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      plan: input.plan,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    },
    update: {
      plan: input.plan,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId ?? undefined,
      stripeSubscriptionId: input.stripeSubscriptionId ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
    },
  });
}

export async function cancelSubscriptionEntitlement(userId: string) {
  return prisma.subscription.updateMany({
    where: { userId },
    data: { plan: "Free", status: "canceled", cancelAtPeriodEnd: false },
  });
}
