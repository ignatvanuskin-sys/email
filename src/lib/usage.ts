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
  if (!Number.isInteger(amount) || amount <= 0 || amount > limit) {
    return { allowed: false, used: 0, limit, remaining: limit };
  }

  // The conditional update is the quota gate. It is evaluated by the
  // database, so two replicas cannot both spend the same remaining unit.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const updatedCount = await prisma.usageCounter.updateMany({
      where: { userId, period, metric, used: { lte: limit - amount } },
      data: { used: { increment: amount } },
    });
    if (updatedCount.count === 1) {
      const updated = await prisma.usageCounter.findUnique({ where: { userId_period_metric: { userId, period, metric } } });
      const used = updated?.used ?? amount;
      return { allowed: true, used, limit, remaining: Math.max(0, limit - used) };
    }

    const current = await prisma.usageCounter.findUnique({ where: { userId_period_metric: { userId, period, metric } } });
    if (current && current.used + amount > limit) {
      return { allowed: false, used: current.used, limit, remaining: Math.max(0, limit - current.used) };
    }
    if (!current) {
      try {
        const created = await prisma.usageCounter.create({ data: { userId, period, metric, used: amount } });
        return { allowed: true, used: created.used, limit, remaining: Math.max(0, limit - created.used) };
      } catch (error) {
        // Another replica may have created the first row. Retry the conditional
        // update once; unrelated database errors remain visible to callers.
        if (!(error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002")) throw error;
      }
    }
  }

  const current = await prisma.usageCounter.findUnique({ where: { userId_period_metric: { userId, period, metric } } });
  const used = current?.used ?? limit;
  return { allowed: false, used, limit, remaining: Math.max(0, limit - used) };
}
