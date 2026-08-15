import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { EMAIL_STATUS, CAMPAIGN_LEAD_STATUS } from "@/lib/status";
import { checkSuppression } from "@/lib/suppression";
import { sendEmail, applyTemplate } from "@/lib/emailSender";
import { daysFromNow } from "@/lib/utils";
import { isApprovalValid } from "@/lib/approval";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { validateCampaignReferences } from "@/lib/ownership";

const STALE_CLAIM_MS = 15 * 60 * 1000;

type CampaignVariables = {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  website: string;
  channel: string;
  telegram: string;
  customNote: string;
};

function campaignVariables(lead: { name: string; companyOrChannel: string; email: string | null; websiteUrl: string | null; telegramUrl: string | null; niche: string | null }): CampaignVariables {
  return {
    firstName: lead.name.split(" ")[0] || "",
    lastName: lead.name.split(" ").slice(1).join(" ") || "",
    company: lead.companyOrChannel || "",
    email: lead.email || "",
    website: lead.websiteUrl || "",
    channel: lead.companyOrChannel || "",
    telegram: lead.telegramUrl || "",
    customNote: lead.niche || "",
  };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    if (campaign.status !== "Running") return badRequest("Campaign is not running");
    if (user.outreachPaused) return badRequest("Outreach is paused");
    await validateCampaignReferences(user.id, campaign);

    const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true } });
    if (!provider) return badRequest("Email provider not configured");

    const lockUntil = new Date(Date.now() + STALE_CLAIM_MS);
    const acquired = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ sendLockUntil: null }, { sendLockUntil: { lt: new Date() } }] },
      data: { sendLockUntil: lockUntil },
    });
    if (acquired.count !== 1) return badRequest("Another campaign dispatch is already running");

    try {
      const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    await prisma.campaignLead.updateMany({
      where: { campaignId: id, status: "Sending", createdAt: { lt: staleBefore } },
      data: { status: CAMPAIGN_LEAD_STATUS.PENDING },
    });

    const startOfDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const reservedToday = await prisma.emailMessage.count({
      where: { userId: user.id, status: { in: [EMAIL_STATUS.SENT, EMAIL_STATUS.SENDING] }, createdAt: { gte: startOfDay } },
    });
    const remaining = Math.min(campaign.dailyLimit, provider.dailyLimit - reservedToday);
    if (remaining <= 0) return badRequest("Daily limit reached");

    const pendingLeads = await prisma.campaignLead.findMany({
      where: { campaignId: id, status: CAMPAIGN_LEAD_STATUS.PENDING },
      include: { lead: true },
      orderBy: { createdAt: "asc" },
      take: remaining,
    });
    const variants = await prisma.campaignVariant.findMany({ where: { campaignId: id }, orderBy: { createdAt: "asc" } });
    const template = campaign.templateId
      ? await prisma.emailTemplate.findFirst({ where: { id: campaign.templateId, userId: user.id } })
      : null;

    let sent = 0;
    let approvalRequired = 0;
    let skipped = 0;
    let skippedNoEmail = 0;
    let skippedSuppressed = 0;
    for (const cl of pendingLeads) {
      const claimed = await prisma.campaignLead.updateMany({
        where: { id: cl.id, campaignId: id, status: CAMPAIGN_LEAD_STATUS.PENDING },
        data: { status: "Sending" },
      });
      if (claimed.count !== 1) continue;

      const lead = cl.lead;
      if (!lead.email) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: CAMPAIGN_LEAD_STATUS.SKIPPED } });
        skipped++;
        skippedNoEmail++;
        continue;
      }

      const check = await checkSuppression(user.id, lead.email, lead.id);
      if (!check.allowed) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: CAMPAIGN_LEAD_STATUS.SKIPPED } });
        skipped++;
        skippedSuppressed++;
        continue;
      }

      let subject = "Hello";
      let body = "{{firstName}},\n\nThis is a test message.";
      if (variants.length > 0) {
        const variant = variants.reduce((a, b) => (a.sent < b.sent ? a : b));
        subject = variant.subject;
        body = variant.body;
      } else if (template) {
        subject = template.subject;
        body = template.body;
      }

      const vars = campaignVariables(lead);
      const finalSubject = applyTemplate(subject, vars);
      const finalBody = `${applyTemplate(body, vars)}\n\n---\nDon't want to receive these emails? Unsubscribe: ${unsubscribeUrl(process.env.APP_URL ?? "http://localhost:3000", user.id, lead.id, lead.email)}`;
      let emailRecord = await prisma.emailMessage.findFirst({
        where: { userId: user.id, campaignId: id, leadId: lead.id, status: { in: [EMAIL_STATUS.DRAFT, EMAIL_STATUS.FAILED, EMAIL_STATUS.APPROVED] } },
        orderBy: { createdAt: "desc" },
      });
      if (!emailRecord) {
        emailRecord = await prisma.emailMessage.create({
          data: { userId: user.id, leadId: lead.id, campaignId: id, subject: finalSubject, body: finalBody, status: EMAIL_STATUS.DRAFT },
        });
      }

      if (!isApprovalValid(emailRecord.id, emailRecord.subject, emailRecord.body, emailRecord.approvalHash, emailRecord.approvalExpiresAt)) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: CAMPAIGN_LEAD_STATUS.PENDING } });
        approvalRequired++;
        continue;
      }

      const sending = await prisma.emailMessage.updateMany({ where: { id: emailRecord.id, userId: user.id, status: { in: [EMAIL_STATUS.DRAFT, EMAIL_STATUS.FAILED, EMAIL_STATUS.APPROVED] } }, data: { status: EMAIL_STATUS.SENDING } });
      if (sending.count !== 1) {
        await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: CAMPAIGN_LEAD_STATUS.PENDING } });
        continue;
      }

      const result = await sendEmail(user.id, { to: lead.email, subject: emailRecord.subject, body: emailRecord.body });
      if (result.ok) {
        await prisma.$transaction([
          prisma.emailMessage.update({ where: { id: emailRecord.id }, data: { status: EMAIL_STATUS.SENT, providerMessageId: result.providerMessageId, sentAt: new Date(), errorMessage: null } }),
          prisma.campaignLead.update({ where: { id: cl.id }, data: { status: CAMPAIGN_LEAD_STATUS.SENT, sentAt: new Date() } }),
          prisma.lead.update({ where: { id: lead.id }, data: { status: "Contacted", lastContactAt: new Date(), nextFollowUpAt: daysFromNow(4) } }),
          prisma.activity.create({ data: { userId: user.id, leadId: lead.id, campaignId: id, type: "EmailSent", payload: JSON.stringify({ emailId: emailRecord.id }) } }),
        ]);
        if (variants.length > 0) {
          const selected = variants.reduce((a, b) => (a.sent < b.sent ? a : b));
          await prisma.campaignVariant.update({ where: { id: selected.id }, data: { sent: { increment: 1 } } });
        }
        sent++;
      } else {
        await prisma.$transaction([
          prisma.emailMessage.update({ where: { id: emailRecord.id }, data: { status: EMAIL_STATUS.FAILED, errorMessage: "Email provider rejected the message" } }),
          prisma.campaignLead.update({ where: { id: cl.id }, data: { status: CAMPAIGN_LEAD_STATUS.SKIPPED } }),
        ]);
      }
    }

    const remainingCount = await prisma.campaignLead.count({ where: { campaignId: id, status: { in: [CAMPAIGN_LEAD_STATUS.PENDING, "Sending"] } } });
    if (remainingCount === 0) {
      await prisma.campaign.update({ where: { id }, data: { status: "Completed", completedAt: new Date() } });
    }

      return ok({ sent, approvalRequired, skipped, skippedNoEmail, skippedSuppressed, remaining: remainingCount });
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { sendLockUntil: null } }).catch(() => {});
    }
  } catch (err) {
    return handleError(err);
  }
}
