import { prisma } from "./prisma";
import { PLAN_LIMITS, type PlanName } from "./usage";

export const PLAN_CATALOG = [
  { id: "Free", name: "Free", priceMonthly: 0, limits: PLAN_LIMITS.Free },
  { id: "Pro", name: "Pro", priceMonthly: 49, limits: PLAN_LIMITS.Pro },
  { id: "Agency", name: "Agency", priceMonthly: 149, limits: PLAN_LIMITS.Agency },
] as const;

export async function getSubscription(userId: string) { return prisma.subscription.upsert({ where: { userId }, create: { userId, plan: "Free", status: "active" }, update: {} }); }
export async function setPlan(userId: string, plan: PlanName) { return prisma.subscription.upsert({ where: { userId }, create: { userId, plan, status: "active" }, update: { plan, status: "active" } }); }
