import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");

    const [leads, emails, replies] = await Promise.all([
      prisma.campaignLead.findMany({ where: { campaignId: id } }),
      prisma.emailMessage.findMany({ where: { campaignId: id } }),
      prisma.reply.findMany({ where: { userId: user.id, emailMessage: { campaignId: id } } }),
    ]);

    const stats = {
      total: leads.length,
      pending: leads.filter((l) => l.status === "Pending").length,
      sent: leads.filter((l) => l.status === "Sent").length,
      replied: leads.filter((l) => l.status === "Replied").length,
      bounced: leads.filter((l) => l.status === "Bounced").length,
      unsubscribed: leads.filter((l) => l.status === "Unsubscribed").length,
      skipped: leads.filter((l) => l.status === "Skipped").length,
      emailsSent: emails.filter((e) => e.status === "Sent").length,
      emailsFailed: emails.filter((e) => e.status === "Failed").length,
      replyCount: replies.length,
      replyRate: emails.filter((e) => e.status === "Sent").length > 0
        ? Math.round((replies.length / emails.filter((e) => e.status === "Sent").length) * 100)
        : 0,
    };

    const variants = await prisma.campaignVariant.findMany({
      where: { campaignId: id },
      select: { id: true, name: true, subject: true, sent: true, replies: true },
    });
    const variantStats = variants.map((v) => ({
      ...v,
      replyRate: v.sent > 0 ? Math.round((v.replies / v.sent) * 100) : 0,
    }));

    return ok({ stats, variants: variantStats });
  } catch (err) {
    return handleError(err);
  }
}