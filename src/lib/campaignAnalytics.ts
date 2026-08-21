import { prisma } from "./prisma";

export type CampaignAnalytics = {
  totals: { sent: number; delivered: number; bounced: number; failed: number; opened: number; clicked: number; replied: number; unsubscribed: number };
  rates: { openRate: number; clickRate: number; replyRate: number; bounceRate: number; unsubscribeRate: number };
  heatmap: Array<{ elementId: string; url: string | null; clicks: number; uniqueEmails: number }>;
  byDay: Array<{ date: string; sent: number; opens: number; clicks: number; replies: number }>;
};

const percent = (value: number, base: number) => base > 0 ? Math.round((value / base) * 1000) / 10 : 0;

export async function aggregateCampaignAnalytics(userId: string, campaignId: string): Promise<CampaignAnalytics | null> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId }, select: { id: true } });
  if (!campaign) return null;

  const [emailCounts, uniqueEngagements, eventCounts, heatmapCounts, uniqueHeatmapContacts, sentByMoment, eventsByMoment, repliesByMoment, replied] = await Promise.all([
    prisma.emailMessage.groupBy({ by: ["status"], where: { campaignId, userId }, _count: { _all: true } }),
    prisma.emailTrackingEvent.findMany({ where: { campaignId, type: { in: ["open", "click"] } }, select: { emailId: true, type: true }, distinct: ["emailId", "type"] }),
    prisma.emailTrackingEvent.groupBy({ by: ["type"], where: { campaignId }, _count: { _all: true } }),
    prisma.emailTrackingEvent.groupBy({ by: ["elementId", "url"], where: { campaignId, type: "click" }, _count: { _all: true } }),
    prisma.emailTrackingEvent.findMany({ where: { campaignId, type: "click" }, select: { emailId: true, elementId: true, url: true }, distinct: ["emailId", "elementId", "url"] }),
    prisma.emailMessage.groupBy({ by: ["sentAt"], where: { campaignId, userId, status: "Sent", sentAt: { not: null } }, _count: { _all: true } }),
    prisma.emailTrackingEvent.groupBy({ by: ["type", "occurredAt"], where: { campaignId, type: { in: ["open", "click"] } }, _count: { _all: true } }),
    prisma.reply.groupBy({ by: ["receivedAt"], where: { userId, emailMessage: { campaignId } }, _count: { _all: true } }),
    prisma.reply.count({ where: { userId, emailMessage: { campaignId } } }),
  ]);

  const countStatus = (status: string) => emailCounts.find((row) => row.status === status)?._count._all ?? 0;
  const sent = countStatus("Sent");
  const bounced = countStatus("Bounced");
  const failed = countStatus("Failed");
  const unsubscribed = countStatus("Unsubscribed");
  const delivered = countStatus("Sent") + countStatus("Delivered");
  const opened = uniqueEngagements.filter((event) => event.type === "open").length;
  const clicked = uniqueEngagements.filter((event) => event.type === "click").length;
  const heatmapContactCounts = new Map<string, number>();
  for (const event of uniqueHeatmapContacts) {
    const key = heatmapKey(event.elementId, event.url);
    heatmapContactCounts.set(key, (heatmapContactCounts.get(key) ?? 0) + 1);
  }
  const heatmap = heatmapCounts
    .map((row) => ({
      elementId: row.elementId || row.url || "unknown",
      url: row.url,
      clicks: row._count._all,
      uniqueEmails: heatmapContactCounts.get(heatmapKey(row.elementId, row.url)) ?? 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const dayMap = new Map<string, { sent: number; opens: number; clicks: number; replies: number }>();
  const addDay = (date: Date, field: "sent" | "opens" | "clicks" | "replies", amount: number) => {
    const key = date.toISOString().slice(0, 10);
    const value = dayMap.get(key) ?? { sent: 0, opens: 0, clicks: 0, replies: 0 };
    value[field] += amount;
    dayMap.set(key, value);
  };
  for (const row of sentByMoment) if (row.sentAt) addDay(row.sentAt, "sent", row._count._all);
  for (const row of eventsByMoment) addDay(row.occurredAt, row.type === "open" ? "opens" : "clicks", row._count._all);
  for (const row of repliesByMoment) addDay(row.receivedAt, "replies", row._count._all);

  return {
    totals: { sent, delivered, bounced, failed, opened, clicked, replied, unsubscribed },
    rates: { openRate: percent(opened, sent), clickRate: percent(clicked, sent), replyRate: percent(replied, sent), bounceRate: percent(bounced, sent), unsubscribeRate: percent(unsubscribed, sent) },
    heatmap,
    byDay: [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })),
  };
}

function heatmapKey(elementId: string | null, url: string | null): string {
  return `${elementId ?? ""}\u0000${url ?? ""}`;
}
