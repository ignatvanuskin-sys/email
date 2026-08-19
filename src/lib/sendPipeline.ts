import { prisma } from "./prisma";
import { checkSuppression } from "./suppression";
import { canSendToContact } from "./frequencyGuard";
import { sendEmail } from "./emailSender";
import { ensureUnsubscribeFooter } from "./unsubscribe";
import { createTrackingToken } from "./tracking";
import { renderEmailHtml } from "./emailHtml";
import { env } from "./env";
import { applyTemplate } from "./emailSender";
import { EMAIL_STATUS } from "./status";
import { daysFromNow } from "./utils";

export type CampaignSendPayload = {
  campaignId: string;
  campaignLeadId: string;
  leadId: string;
  variantId?: string;
  subject: string;
  body: string;
};

export type JourneySendPayload = {
  enrollmentId: string;
  stepId: string;
  leadId: string;
  subject: string;
  body: string;
};

export type SendPayload = Partial<CampaignSendPayload> & Partial<JourneySendPayload> & {
  emailId?: string;
  telegramChatId?: string;
  channel?: string;
};

export async function enqueueSend(userId: string, type: "campaign" | "journey", payload: SendPayload): Promise<void> {
  await prisma.sendJob.create({ data: { userId, type, payload: JSON.stringify(payload), status: "Queued" } });
}

export async function processSendJobs(limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const jobs = await prisma.sendJob.findMany({
    where: {
      status: { in: ["Queued", "Retry"] },
      nextRunAt: { lte: now },
      OR: [{ lockUntil: null }, { lockUntil: { lt: now } }],
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    const lockUntil = new Date(Date.now() + 5 * 60_000);
    const claimed = await prisma.sendJob.updateMany({
      where: {
        id: job.id,
        status: { in: ["Queued", "Retry"] },
        OR: [{ lockUntil: null }, { lockUntil: { lt: now } }],
      },
      data: { lockUntil, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const attempts = job.attempts + 1;
    let payload = payloadFor(job);
    try {
      payload = JSON.parse(job.payload) as SendPayload;
      if (!payload.leadId) {
        await failJob(job.id, attempts, job.maxAttempts, "Invalid recipient binding");
        failed++;
        continue;
      }

      const lead = await prisma.lead.findFirst({
        where: { id: payload.leadId, userId: job.userId },
        select: { id: true, email: true, name: true, companyOrChannel: true, status: true },
      });
      if (!lead) {
        await failJob(job.id, attempts, job.maxAttempts, "Invalid recipient binding");
        failed++;
        continue;
      }

      if (job.type === "campaign") {
        const campaign = payload.campaignId
          ? await prisma.campaign.findFirst({ where: { id: payload.campaignId, userId: job.userId }, select: { id: true, frequencyCap: true, frequencyWindowDays: true } })
          : null;
        const campaignLead = payload.campaignId && payload.campaignLeadId
          ? await prisma.campaignLead.findFirst({ where: { id: payload.campaignLeadId, campaignId: payload.campaignId, leadId: lead.id, campaign: { userId: job.userId } }, select: { id: true } })
          : null;
        if (!campaign || !campaignLead) {
          await failJob(job.id, attempts, job.maxAttempts, "Invalid campaign recipient binding");
          failed++;
          continue;
        }
        if (campaign.frequencyCap && campaign.frequencyWindowDays) {
          const frequency = await canSendToContact(job.userId, lead.id, { maxMessages: campaign.frequencyCap, windowDays: campaign.frequencyWindowDays });
          if (!frequency.allowed) {
            await markSkipped(job.id, payload, job.userId, "Frequency cap");
            continue;
          }
        }
      } else {
        const enrollment = payload.enrollmentId
          ? await prisma.journeyEnrollment.findFirst({ where: { id: payload.enrollmentId, userId: job.userId, leadId: lead.id, sequence: { userId: job.userId } }, select: { id: true } })
          : null;
        if (!enrollment) {
          await failJob(job.id, attempts, job.maxAttempts, "Invalid journey recipient binding");
          failed++;
          continue;
        }
        const frequency = await canSendToContact(job.userId, lead.id, { maxMessages: 3, windowDays: 7 });
        if (!frequency.allowed) {
          await prisma.sendJob.update({ where: { id: job.id }, data: { nextRunAt: frequency.nextAllowedAt ?? new Date(Date.now() + 60_000), lockUntil: null } });
          continue;
        }
      }

      if (!lead.email) {
        await markSkipped(job.id, payload, job.userId, "No recipient email");
        continue;
      }
      const suppression = await checkSuppression(job.userId, lead.email, lead.id);
      if (!suppression.allowed) {
        await markSkipped(job.id, payload, job.userId, suppression.reason);
        continue;
      }

      const vars = { firstName: lead.name?.split(" ")[0] ?? "", name: lead.name ?? "", company: lead.companyOrChannel ?? "", email: lead.email };
      const subject = applyTemplate(payload.subject ?? "", vars);
      const body = applyTemplate(payload.body ?? "", vars);

      if (payload.channel === "telegram" && payload.telegramChatId) {
        const { sendTelegram } = await import("./telegram");
        const result = await sendTelegram(job.userId, payload.telegramChatId, body);
        if (!result.ok) throw new Error("Telegram delivery failed");
        sent++;
        await completeJob(job.id, payload, job.userId, result.messageId);
        continue;
      }

      const emailRecord = payload.emailId
        ? await prisma.emailMessage.findFirst({
            where: {
              id: payload.emailId,
              userId: job.userId,
              leadId: lead.id,
              ...(payload.campaignId ? { campaignId: payload.campaignId } : {}),
              ...(payload.stepId ? { sequenceStepId: payload.stepId } : {}),
            },
          })
        : await prisma.emailMessage.create({ data: { userId: job.userId, leadId: lead.id, campaignId: payload.campaignId || null, sequenceStepId: payload.stepId || null, variantId: payload.variantId || null, subject, body, status: "Queued" } });
      if (!emailRecord) throw new Error("Queued email record not found");

      const trackingToken = createTrackingToken(job.userId, emailRecord.id);
      const appUrl = env.APP_URL;
      const emailWithUnsub = ensureUnsubscribeFooter(body, appUrl, job.userId, lead.id, lead.email);
      const rendered = renderEmailHtml(emailWithUnsub, {}, {
        trackingUrl: (url, index) => `${appUrl}/api/tracking/click?token=${encodeURIComponent(trackingToken)}&element=link-${index}&url=${encodeURIComponent(url)}`,
        pixelUrl: `${appUrl}/api/tracking/open?token=${encodeURIComponent(trackingToken)}`,
      });
      const result = await sendEmail(job.userId, { to: lead.email, subject, body: emailWithUnsub, html: rendered.html });
      if (!result.ok) throw new Error("Email delivery failed");
      await prisma.emailMessage.updateMany({ where: { id: emailRecord.id, userId: job.userId, leadId: lead.id }, data: { status: EMAIL_STATUS.SENT, providerMessageId: result.providerMessageId, sentAt: new Date(), trackingToken } });
      await completeJob(job.id, payload, job.userId, result.providerMessageId);
      sent++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message.slice(0, 200) : "Send failed";
      await failJob(job.id, attempts, job.maxAttempts, message);
      await failPayload(job.id, payload, job.userId, message);
    }
  }
  return { processed: jobs.length, sent, failed };
}

function payloadFor(job: { payload: string }): SendPayload {
  try { return JSON.parse(job.payload) as SendPayload; } catch { return {}; }
}

async function completeJob(jobId: string, payload: SendPayload, userId: string, providerMessageId: string) {
  const now = new Date();
  await prisma.sendJob.update({ where: { id: jobId }, data: { status: "Sent", providerMessageId, processedAt: now, lastError: null, lockUntil: null } });
  if (payload.campaignLeadId && payload.campaignId && payload.leadId) {
    await prisma.campaignLead.updateMany({ where: { id: payload.campaignLeadId, campaignId: payload.campaignId, leadId: payload.leadId, campaign: { userId } }, data: { status: "Sent", sentAt: now } });
    if (payload.variantId) await prisma.campaignVariant.updateMany({ where: { id: payload.variantId, campaignId: payload.campaignId, campaign: { userId } }, data: { sent: { increment: 1 } } });
    await prisma.lead.updateMany({ where: { id: payload.leadId, userId }, data: { status: "Contacted", lastContactAt: now, nextFollowUpAt: daysFromNow(4) } });
  }
  if (payload.enrollmentId && payload.leadId) {
    const enrollment = await prisma.journeyEnrollment.findFirst({ where: { id: payload.enrollmentId, userId, leadId: payload.leadId, sequence: { userId } }, include: { sequence: { include: { steps: { where: { enabled: true }, orderBy: { position: "asc" } } } } } });
    if (enrollment) {
      const nextIndex = enrollment.currentStep + 1;
      const nextStep = enrollment.sequence.steps[nextIndex];
      await prisma.journeyEnrollment.updateMany({ where: { id: enrollment.id, userId, leadId: payload.leadId }, data: nextStep ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + nextStep.delayDays * 86_400_000), lastError: null } : { currentStep: nextIndex, status: "Completed", nextRunAt: null, lastError: null } });
    }
  }
}

async function markSkipped(jobId: string, payload: SendPayload, userId: string, reason: string) {
  await prisma.sendJob.update({ where: { id: jobId }, data: { status: "Skipped", lastError: reason.slice(0, 200), lockUntil: null, processedAt: new Date() } });
  if (payload.campaignLeadId && payload.campaignId && payload.leadId) await prisma.campaignLead.updateMany({ where: { id: payload.campaignLeadId, campaignId: payload.campaignId, leadId: payload.leadId, campaign: { userId } }, data: { status: "Skipped" } });
  if (payload.emailId && payload.leadId) await prisma.emailMessage.updateMany({ where: { id: payload.emailId, userId, leadId: payload.leadId }, data: { status: "Failed", errorMessage: reason.slice(0, 200) } });
  if (payload.enrollmentId && payload.leadId) await prisma.journeyEnrollment.updateMany({ where: { id: payload.enrollmentId, userId, leadId: payload.leadId }, data: { status: "Cancelled", nextRunAt: null, lastError: reason.slice(0, 200) } });
}

async function failPayload(jobId: string, payload: SendPayload, userId: string, reason: string) {
  if (payload.campaignLeadId && payload.campaignId && payload.leadId) await prisma.campaignLead.updateMany({ where: { id: payload.campaignLeadId, campaignId: payload.campaignId, leadId: payload.leadId, campaign: { userId } }, data: { status: "Skipped" } });
  if (payload.emailId && payload.leadId) await prisma.emailMessage.updateMany({ where: { id: payload.emailId, userId, leadId: payload.leadId }, data: { status: "Failed", errorMessage: reason.slice(0, 200) } });
  if (payload.enrollmentId && payload.leadId) await prisma.journeyEnrollment.updateMany({ where: { id: payload.enrollmentId, userId, leadId: payload.leadId }, data: { status: "Failed", nextRunAt: null, lastError: reason.slice(0, 200) } });
  void jobId;
}

async function failJob(jobId: string, attempts: number, maxAttempts: number, reason: string) {
  if (attempts >= maxAttempts) {
    await prisma.sendJob.update({ where: { id: jobId }, data: { status: "Failed", lastError: reason.slice(0, 200), lockUntil: null, processedAt: new Date() } });
  } else {
    await prisma.sendJob.update({ where: { id: jobId }, data: { status: "Retry", lastError: reason.slice(0, 200), nextRunAt: new Date(Date.now() + 60_000 * 2 ** Math.max(0, attempts - 1)), lockUntil: null } });
  }
}
