import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { checkSuppression } from "@/lib/suppression";
import { applyTemplate } from "@/lib/emailSender";
import { createTrackingToken } from "@/lib/tracking";
import { canSendToContact } from "@/lib/frequencyGuard";
import { enqueueSend } from "@/lib/sendPipeline";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    if (campaign.status !== "Running") return badRequest("Campaign is not running");
    if (user.outreachPaused) return badRequest("Outreach is paused");

    const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true } });
    if (!provider) return badRequest("Email provider not configured");
    const startOfDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const sentToday = await prisma.emailMessage.count({ where: { userId: user.id, status: "Sent", sentAt: { gte: startOfDay } } });
    const remaining = Math.min(campaign.dailyLimit, provider.dailyLimit - sentToday);
    if (remaining <= 0) return badRequest("Daily limit reached");

    const pendingLeads = await prisma.campaignLead.findMany({
      where: { campaignId: id, status: "Pending" },
       include: { lead: true },
      take: remaining,
    });

    let queued = 0;
    for (const cl of pendingLeads) {
      const lead = cl.lead;
      if (!lead.email) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "Skipped" } });
        continue;
      }

      const check = await checkSuppression(user.id, lead.email, lead.id);
      if (!check.allowed) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "Skipped" } });
        continue;
      }

      if (campaign.frequencyCap && campaign.frequencyWindowDays) {
        const frequency = await canSendToContact(user.id, lead.id, { maxMessages: campaign.frequencyCap, windowDays: campaign.frequencyWindowDays });
        if (!frequency.allowed) {
          await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "Skipped" } });
          continue;
        }
      }

      let subject = "Hello";
      let body = "{{firstName}},\n\nThis is a test message.";

       const variants = await prisma.campaignVariant.findMany({ where: { campaignId: id } });
       if (cl.assignedVariantId) {
         const variant = variants.find((item) => item.id === cl.assignedVariantId);
         if (variant) {
           subject = variant.subject;
           body = variant.body;
           await prisma.campaignVariant.update({ where: { id: variant.id }, data: { sent: { increment: 1 } } });
         }
       } else if (variants.length > 0) {
         const variant = variants.reduce((a, b) => (a.sent < b.sent ? a : b));
        subject = variant.subject;
        body = variant.body;
        await prisma.campaignVariant.update({ where: { id: variant.id }, data: { sent: { increment: 1 } } });
       } else if (campaign.templateId) {
         const tmpl = await prisma.emailTemplate.findFirst({ where: { id: campaign.templateId, userId: user.id } });
         if (tmpl) { subject = tmpl.subject; body = tmpl.documentJson ?? tmpl.body; }
      }

      const vars = {
        firstName: lead.name?.split(" ")[0] || "",
        lastName: lead.name?.split(" ").slice(1).join(" ") || "",
        company: lead.companyOrChannel || "",
        email: lead.email || "",
        website: lead.websiteUrl || "",
        channel: lead.companyOrChannel || "",
        telegram: lead.telegramUrl || "",
        customNote: lead.niche || "",
      };
      const finalSubject = applyTemplate(subject, vars);
      const finalBody = applyTemplate(body, vars);
      const emailRecord = await prisma.emailMessage.create({
        data: {
          userId: user.id,
          leadId: lead.id,
          campaignId: id,
          subject: finalSubject,
          body: finalBody,
          status: "Queued",
        },
      });

      const trackingToken = createTrackingToken(user.id, emailRecord.id);
      await prisma.emailMessage.update({ where: { id: emailRecord.id }, data: { trackingToken } });

      await enqueueSend(user.id, "campaign", { campaignId: id, campaignLeadId: cl.id, leadId: lead.id, emailId: emailRecord.id, subject: finalSubject, body: finalBody });
      queued++;
    }

    const remainingCount = await prisma.campaignLead.count({ where: { campaignId: id, status: "Pending" } });
    if (remainingCount === 0) {
      await prisma.campaign.update({ where: { id }, data: { status: "Completed", completedAt: new Date() } });
    }

    return ok({ queued, remaining: remainingCount });
  } catch (err) {
    return handleError(err);
  }
}
