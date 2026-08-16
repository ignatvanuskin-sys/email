import { prisma } from "./prisma";

export type FrequencyPolicy = { maxMessages: number; windowDays: number; bypassTransactional?: boolean };

export async function canSendToContact(userId: string, leadId: string, policy: FrequencyPolicy, now = new Date()): Promise<{ allowed: boolean; nextAllowedAt: Date | null; sentInWindow: number }> {
  const since = new Date(now.getTime() - policy.windowDays * 86_400_000);
  const sentInWindow = await prisma.emailMessage.count({ where: { userId, leadId, status: { in: ["Sent", "Delivered"] }, sentAt: { gte: since, lte: now } } });
  if (sentInWindow < policy.maxMessages) return { allowed: true, nextAllowedAt: null, sentInWindow };
  const oldest = await prisma.emailMessage.findFirst({ where: { userId, leadId, status: { in: ["Sent", "Delivered"] }, sentAt: { gte: since, lte: now } }, orderBy: { sentAt: "asc" }, select: { sentAt: true } });
  return { allowed: false, nextAllowedAt: oldest?.sentAt ? new Date(oldest.sentAt.getTime() + policy.windowDays * 86_400_000) : new Date(now.getTime() + policy.windowDays * 86_400_000), sentInWindow };
}

export function optimalSendHour(clickHours: number[], fallback = 10): number {
  if (!clickHours.length) return fallback;
  const counts = new Map<number, number>();
  for (const hour of clickHours) if (Number.isInteger(hour) && hour >= 0 && hour < 24) counts.set(hour, (counts.get(hour) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? fallback;
}

export async function recommendedSendHour(userId: string, leadId: string, fallback = 10): Promise<{ hour: number; sampleSize: number }> {
  const events = await prisma.emailTrackingEvent.findMany({ where: { email: { leadId, userId }, type: { in: ["open", "click"] } }, select: { occurredAt: true } });
  return { hour: optimalSendHour(events.map((event) => event.occurredAt.getHours()), fallback), sampleSize: events.length };
}
