import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const [
      leadCounts,
      emailsSent,
      replies,
      qualified,
      hotLeads,
      dueFollowUps,
      recentReplies,
      activities,
      campaignsTotal,
      campaignsRunning,
    ] = await Promise.all([
      prisma.lead.groupBy({
        by: ["status"],
        where: { userId: user.id },
        _count: { _all: true },
      }),
      prisma.emailMessage.count({ where: { userId: user.id, status: "Sent" } }),
      prisma.reply.count({ where: { userId: user.id } }),
      prisma.lead.count({ where: { userId: user.id, status: { in: ["Analyzed", "Contacted", "Replied", "Interested"] } } }),
      prisma.lead.findMany({
        where: { userId: user.id },
        orderBy: { leadScore: "desc" },
        take: 5,
        select: { id: true, name: true, leadScore: true },
      }),
      prisma.followUp.findMany({
        where: { userId: user.id, status: "Pending", dueDate: { lte: endOfDay() } },
        orderBy: { dueDate: "asc" },
        take: 10,
        select: {
          id: true,
          dueDate: true,
          lead: { select: { id: true, name: true, companyOrChannel: true } },
        },
      }),
      prisma.reply.findMany({
        where: { userId: user.id },
        orderBy: { receivedAt: "desc" },
        take: 5,
        select: {
          id: true,
          classification: true,
          receivedAt: true,
          lead: { select: { id: true, name: true } },
        },
      }),
      prisma.activity.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          payload: true,
          createdAt: true,
          lead: { select: { id: true, name: true } },
        },
      }),
      prisma.campaign.count({ where: { userId: user.id } }),
      prisma.campaign.count({ where: { userId: user.id, status: "Running" } }),
    ]);

    const counts = new Map(leadCounts.map((row) => [row.status, row._count._all]));
    const count = (status: string) => counts.get(status) ?? 0;
    const totalLeads = leadCounts.reduce((total, row) => total + row._count._all, 0);
    const replyRate = emailsSent > 0 ? Math.min(100, Math.round((replies / emailsSent) * 100)) : 0;

    const emailStats = await prisma.emailMessage.groupBy({
      by: ["status"],
      where: { userId: user.id },
      _count: { _all: true },
    });
    const emailStatusCounts = new Map(emailStats.map((row) => [row.status, row._count._all]));
    const emailCount = (status: string) => emailStatusCounts.get(status) ?? 0;

    return ok({
      counters: {
        totalLeads,
        newLeads: count("New"),
        qualified,
        contacted: count("Contacted"),
        interested: count("Interested"),
        clients: count("Client"),
        emailsSent,
        replies,
        replyRate,
        pendingFollowUps: dueFollowUps.length,
      },
      analytics: {
        delivered: emailCount("Sent") + emailCount("Delivered"),
        bounced: emailCount("Bounced"),
        failed: emailCount("Failed"),
        unsubscribed: emailCount("Unsubscribed"),
        totalCampaigns: campaignsTotal,
        runningCampaigns: campaignsRunning,
      },
      hotLeads: hotLeads.map((l) => ({ id: l.id, name: l.name, leadScore: l.leadScore })),
      dueFollowUps: dueFollowUps.map((f) => ({
        id: f.id,
        dueDate: f.dueDate.toISOString(),
        lead: f.lead,
      })),
      recentReplies: recentReplies.map((r) => ({
        id: r.id,
        classification: r.classification,
        receivedAt: r.receivedAt.toISOString(),
        lead: r.lead,
      })),
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        payload: safePayload(a.payload),
        createdAt: a.createdAt.toISOString(),
        lead: a.lead,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

function safePayload(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function endOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}