import { prisma } from "./prisma";
import { aggregateCohorts } from "./cohortAnalytics";
import { usageSnapshot } from "./usage";

export async function aggregateAnalyticsSummary(userId: string) {
  const [emails, events, replies, cohorts, usage] = await Promise.all([
    prisma.emailMessage.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    prisma.event.findMany({ where: { userId }, select: { type: true, properties: true, occurredAt: true } }),
    prisma.reply.count({ where: { userId } }),
    aggregateCohorts(userId),
    usageSnapshot(userId),
  ]);
  const count = (status: string) => emails.find((row) => row.status === status)?._count._all ?? 0;
  let revenue = 0;
  let conversions = 0;
  for (const event of events) if (["purchase", "order.paid", "conversion"].includes(event.type)) { conversions++; try { const value = Number((JSON.parse(event.properties) as Record<string, unknown>).amount ?? 0); if (Number.isFinite(value) && value >= 0) revenue += value; } catch { /* ignore malformed event */ } }
  const sent = count("Sent") + count("Delivered");
  return { totals: { sent, failed: count("Failed"), bounced: count("Bounced"), unsubscribed: count("Unsubscribed"), replies, conversions, revenue: Math.round(revenue * 100) / 100 }, rates: { replyRate: sent ? Math.round((replies / sent) * 1000) / 10 : 0, conversionRate: sent ? Math.round((conversions / sent) * 1000) / 10 : 0 }, cohorts, usage };
}
