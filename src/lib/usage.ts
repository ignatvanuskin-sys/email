import { prisma } from "./prisma";

export const PLAN_LIMITS = {
  Free: { contacts: 1000, emails: 500, aiGenerations: 50, apiEvents: 1000 },
  Pro: { contacts: 10000, emails: 10000, aiGenerations: 1000, apiEvents: 25000 },
  Agency: { contacts: 100000, emails: 100000, aiGenerations: 10000, apiEvents: 250000 },
} as const;

export type UsageMetric = keyof typeof PLAN_LIMITS.Free;
export type PlanName = keyof typeof PLAN_LIMITS;

export function currentPeriod(date = new Date()): string { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
export function limitFor(plan: PlanName, metric: UsageMetric): number { return PLAN_LIMITS[plan][metric]; }

export async function usageSnapshot(userId: string, plan: PlanName = "Free", date = new Date()) {
  const subscription = await prisma.subscription.findUnique({ where: { userId }, select: { plan: true } });
  if (subscription?.plan && subscription.plan in PLAN_LIMITS) plan = subscription.plan as PlanName;
  const period = currentPeriod(date);
  const counters = await prisma.usageCounter.findMany({ where: { userId, period } });
  const values = Object.fromEntries(counters.map((counter) => [counter.metric, counter.used])) as Partial<Record<UsageMetric, number>>;
  return { plan, period, metrics: (Object.keys(PLAN_LIMITS[plan]) as UsageMetric[]).map((metric) => ({ metric, used: values[metric] ?? 0, limit: limitFor(plan, metric), remaining: Math.max(0, limitFor(plan, metric) - (values[metric] ?? 0)), percent: Math.min(100, Math.round(((values[metric] ?? 0) / limitFor(plan, metric)) * 100)) })) };
}

export async function consumeUsage(userId: string, metric: UsageMetric, amount = 1, plan: PlanName = "Free") {
  const period = currentPeriod();
  const limit = limitFor(plan, metric);
  const current = await prisma.usageCounter.findUnique({ where: { userId_period_metric: { userId, period, metric } } });
  const used = current?.used ?? 0;
  if (used + amount > limit) return { allowed: false, used, limit, remaining: Math.max(0, limit - used) };
  const updated = await prisma.usageCounter.upsert({ where: { userId_period_metric: { userId, period, metric } }, create: { userId, period, metric, used: amount }, update: { used: { increment: amount } } });
  return { allowed: true, used: updated.used, limit, remaining: Math.max(0, limit - updated.used) };
}
