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
  const [emails, replies, events] = await Promise.all([
    prisma.emailMessage.findMany({ where: { campaignId }, select: { id: true, status: true, sentAt: true } }),
    prisma.reply.findMany({ where: { userId, emailMessage: { campaignId } }, select: { receivedAt: true } }),
    prisma.emailTrackingEvent.findMany({ where: { campaignId }, select: { emailId: true, type: true, elementId: true, url: true, occurredAt: true } }),
  ]);
  const sent = emails.filter((email) => email.status === "Sent").length;
  const opened = new Set(events.filter((event) => event.type === "open").map((event) => event.emailId)).size;
  const clicked = new Set(events.filter((event) => event.type === "click").map((event) => event.emailId)).size;
  const replied = replies.length;
  const bounced = emails.filter((email) => email.status === "Bounced").length;
  const failed = emails.filter((email) => email.status === "Failed").length;
  const unsubscribed = emails.filter((email) => email.status === "Unsubscribed").length;
  const heatmapMap = new Map<string, { url: string | null; clicks: number; emails: Set<string> }>();
  for (const event of events.filter((item) => item.type === "click")) {
    const key = event.elementId || event.url || "unknown";
    const current = heatmapMap.get(key) ?? { url: event.url, clicks: 0, emails: new Set<string>() };
    current.clicks++;
    current.emails.add(event.emailId);
    heatmapMap.set(key, current);
  }
  const dayMap = new Map<string, { sent: number; opens: number; clicks: number; replies: number }>();
  const day = (date: Date) => date.toISOString().slice(0, 10);
  for (const email of emails) if (email.sentAt) { const value = dayMap.get(day(email.sentAt)) ?? { sent: 0, opens: 0, clicks: 0, replies: 0 }; value.sent++; dayMap.set(day(email.sentAt), value); }
  for (const event of events) { const value = dayMap.get(day(event.occurredAt)) ?? { sent: 0, opens: 0, clicks: 0, replies: 0 }; if (event.type === "open") value.opens++; if (event.type === "click") value.clicks++; dayMap.set(day(event.occurredAt), value); }
  for (const reply of replies) { const value = dayMap.get(day(reply.receivedAt)) ?? { sent: 0, opens: 0, clicks: 0, replies: 0 }; value.replies++; dayMap.set(day(reply.receivedAt), value); }
  return {
    totals: { sent, delivered: emails.filter((email) => ["Sent", "Delivered"].includes(email.status)).length, bounced, failed, opened, clicked, replied, unsubscribed },
    rates: { openRate: percent(opened, sent), clickRate: percent(clicked, sent), replyRate: percent(replied, sent), bounceRate: percent(bounced, sent), unsubscribeRate: percent(unsubscribed, sent) },
    heatmap: [...heatmapMap.entries()].sort(([, a], [, b]) => b.clicks - a.clicks).map(([elementId, value]) => ({ elementId, url: value.url, clicks: value.clicks, uniqueEmails: value.emails.size })),
    byDay: [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })),
  };
}
