import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { checkSuppression } from "@/lib/suppression";
import { applyTemplate } from "@/lib/emailSender";
import { canSendToContact } from "@/lib/frequencyGuard";
import { enqueueSend } from "@/lib/sendPipeline";
import { isCampaignApprovalValid } from "@/lib/approval";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const lockToken = randomUUID();
  const lockUntil = new Date(Date.now() + 60_000);

  try {
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    if (campaign.status !== "Running") return badRequest("Campaign is not running");
    if (!campaign.activeVersionId) return badRequest("Campaign version approval required");
    const version = await prisma.campaignVersion.findFirst({ where: { id: campaign.activeVersionId, campaignId: id } });
    if (!version || !isCampaignApprovalValid(id, version.id, version.contentHash, campaign.approvalHash, campaign.approvalExpiresAt)) {
      return badRequest("Approve the current campaign version before sending");
    }
    if (user.outreachPaused) return badRequest("Outreach is paused");

    const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true } });
    if (!provider) return badRequest("Email provider not configured");
    const startOfDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const committedToday = await prisma.emailMessage.count({ where: { userId: user.id, status: { in: ["Sent", "Queued"] }, createdAt: { gte: startOfDay } } });
    const remaining = Math.min(campaign.dailyLimit, provider.dailyLimit - committedToday);
    if (remaining <= 0) return badRequest("Daily limit reached");

    const claimedLock = await prisma.campaign.updateMany({
      where: { id, userId: user.id, status: "Running", OR: [{ dispatchLockUntil: null }, { dispatchLockUntil: { lt: new Date() } }] },
      data: { dispatchLockUntil: lockUntil, dispatchLockToken: lockToken },
    });
    if (claimedLock.count === 0) return badRequest("Campaign dispatch is already running");

    try {
      const pendingLeads = await prisma.campaignLead.findMany({
        where: { campaignId: id, status: "Pending", campaign: { userId: user.id } },
        include: { lead: true },
        orderBy: { createdAt: "asc" },
        take: remaining,
      });

      const [variants, template] = await Promise.all([
        prisma.campaignVariant.findMany({ where: { campaignId: id }, orderBy: { sent: "asc" } }),
        campaign.templateId ? prisma.emailTemplate.findFirst({ where: { id: campaign.templateId, userId: user.id } }) : Promise.resolve(null),
      ]);
      let queued = 0;
      const errors: Array<{ campaignLeadId: string; code: string }> = [];
      for (const candidate of pendingLeads) {
        const claimed = await prisma.campaignLead.updateMany({
          where: { id: candidate.id, campaignId: id, leadId: candidate.leadId, status: "Pending", campaign: { userId: user.id } },
          data: { status: "Queued" },
        });
        if (claimed.count === 0) continue;
        const lead = candidate.lead;
        try {
          if (!lead.email) {
            await prisma.campaignLead.updateMany({ where: { id: candidate.id, campaignId: id, status: "Queued" }, data: { status: "Skipped" } });
            continue;
          }

          const check = await checkSuppression(user.id, lead.email, lead.id);
          if (!check.allowed) {
            await prisma.campaignLead.updateMany({ where: { id: candidate.id, campaignId: id, status: "Queued" }, data: { status: "Skipped" } });
            continue;
          }
          if (campaign.frequencyCap && campaign.frequencyWindowDays) {
            const frequency = await canSendToContact(user.id, lead.id, { maxMessages: campaign.frequencyCap, windowDays: campaign.frequencyWindowDays });
            if (!frequency.allowed) {
              await prisma.campaignLead.updateMany({ where: { id: candidate.id, campaignId: id, status: "Queued" }, data: { status: "Skipped" } });
              continue;
            }
          }

          let subject = "Hello";
          let body = "{{firstName}},\n\nThis is a test message.";
          let variantId: string | undefined;
          if (candidate.assignedVariantId) {
            const variant = variants.find((item) => item.id === candidate.assignedVariantId);
            if (variant) { variantId = variant.id; subject = variant.subject; body = variant.body; }
          } else if (variants.length > 0) {
            const variant = variants[0];
            variantId = variant.id;
            subject = variant.subject;
            body = variant.body;
          } else if (template) {
            subject = template.subject;
            body = template.documentJson ?? template.body;
          }

          const vars = {
            firstName: lead.name?.split(" ")[0] || "",
            lastName: lead.name?.split(" ").slice(1).join(" ") || "",
            company: lead.companyOrChannel || "",
            email: lead.email,
            website: lead.websiteUrl || "",
            channel: lead.companyOrChannel || "",
            telegram: lead.telegramUrl || "",
            customNote: lead.niche || "",
          };
          const finalSubject = applyTemplate(subject, vars);
          const finalBody = applyTemplate(body, vars);
          const emailRecord = await prisma.emailMessage.create({ data: { userId: user.id, leadId: lead.id, campaignId: id, variantId: variantId ?? null, subject: finalSubject, body: finalBody, status: "Queued" } });
          const enqueued = await enqueueSend(user.id, "campaign", { campaignId: id, campaignLeadId: candidate.id, leadId: lead.id, emailId: emailRecord.id, variantId, subject: finalSubject, body: finalBody, dedupeKey: `campaign:${candidate.id}` });
          if (!enqueued) {
            await prisma.campaignLead.updateMany({ where: { id: candidate.id, campaignId: id, status: "Queued" }, data: { status: "Pending" } });
            await prisma.emailMessage.update({ where: { id: emailRecord.id }, data: { status: "Draft" } });
            errors.push({ campaignLeadId: candidate.id, code: "OUTREACH_PAUSED" });
            continue;
          }
          queued++;
        } catch (error) {
          const code = error instanceof Error && error.name ? error.name : "DISPATCH_FAILED";
          console.error("[campaign-dispatch-failed]", { campaignId: id, campaignLeadId: candidate.id, code, error });
          errors.push({ campaignLeadId: candidate.id, code: "DISPATCH_FAILED" });
          await prisma.campaignLead.updateMany({ where: { id: candidate.id, campaignId: id, status: "Queued" }, data: { status: "Failed" } });
        }
      }

      const remainingCount = await prisma.campaignLead.count({ where: { campaignId: id, status: "Pending" } });
      if (remainingCount === 0) await prisma.campaign.updateMany({ where: { id, userId: user.id }, data: { status: "Completed", completedAt: new Date() } });
      return ok({ queued, remaining: remainingCount, errors });
    } finally {
      await prisma.campaign.updateMany({ where: { id, userId: user.id, dispatchLockToken: lockToken }, data: { dispatchLockUntil: null, dispatchLockToken: null } });
    }
  } catch (error) {
    return handleError(error);
  }
}
