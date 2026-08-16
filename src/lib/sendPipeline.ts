import { prisma } from "./prisma";
import { checkSuppression } from "./suppression";
import { canSendToContact } from "./frequencyGuard";
import { sendEmail } from "./emailSender";
import { createUnsubscribeToken } from "./webhookSecurity";
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

export type SendPayload = Partial<CampaignSendPayload> & Partial<JourneySendPayload> & { emailId?: string; telegramChatId?: string; channel?: string };

export async function enqueueSend(userId: string, type: "campaign" | "journey", payload: SendPayload): Promise<void> {
  await prisma.sendJob.create({ data: { userId, type, payload: JSON.stringify(payload), status: "Queued" } });
}

export async function processSendJobs(limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date();
  const jobs = await prisma.sendJob.findMany({
    where: { status: { in: ["Queued", "Retry"] }, nextRunAt: { lte: now }, OR: [{ lockUntil: null }, { lockUntil: { lt: now } }] },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    const lockUntil = new Date(now.getTime() + 5 * 60_000);
    const claimed = await prisma.sendJob.updateMany({ where: { id: job.id, OR: [{ lockUntil: null }, { lockUntil: { lt: now } }] }, data: { lockUntil, attempts: { increment: 1 } } });
    if (claimed.count === 0) continue;
    try {
      const payload = JSON.parse(job.payload) as SendPayload;
      const lead = await prisma.lead.findUnique({ where: { id: payload.leadId }, select: { id: true, email: true, name: true, companyOrChannel: true, status: true } });
      if (!lead?.email) { await markSkipped(job, payload, "No recipient email"); continue; }
      const suppression = await checkSuppression(job.userId, lead.email, lead.id);
      if (!suppression.allowed) { await markSkipped(job, payload, suppression.reason); continue; }
      if (job.type === "campaign") {
        const campaign = await prisma.campaign.findFirst({ where: { id: payload.campaignId, userId: job.userId } });
        if (campaign?.frequencyCap && campaign.frequencyWindowDays) {
          const frequency = await canSendToContact(job.userId, lead.id, { maxMessages: campaign.frequencyCap, windowDays: campaign.frequencyWindowDays });
          if (!frequency.allowed) { await markSkipped(job, payload, "Frequency cap"); continue; }
        }
      } else {
        const frequency = await canSendToContact(job.userId, lead.id, { maxMessages: 3, windowDays: 7 });
        if (!frequency.allowed) { await prisma.sendJob.update({ where: { id: job.id }, data: { nextRunAt: frequency.nextAllowedAt ?? new Date(Date.now() + 60_000), lockUntil: null } }); continue; }
      }
      const vars = { firstName: lead.name?.split(" ")[0] ?? "", name: lead.name ?? "", company: lead.companyOrChannel ?? "", email: lead.email };
      const subject = applyTemplate(payload.subject ?? "", vars);
      const body = applyTemplate(payload.body ?? "", vars);
      if (payload.channel === "telegram" && payload.telegramChatId) {
        const { sendTelegram } = await import("./telegram");
        const result = await sendTelegram(job.userId, payload.telegramChatId, body);
        if (!result.ok) throw new Error(result.error);
        sent++;
        await completeJob(job, payload, result.messageId);
        continue;
      }
      const emailRecord = payload.emailId
        ? await prisma.emailMessage.findFirst({ where: { id: payload.emailId, userId: job.userId, leadId: lead.id } })
        : await prisma.emailMessage.create({ data: { userId: job.userId, leadId: lead.id, campaignId: payload.campaignId || null, sequenceStepId: payload.stepId || null, subject, body, status: "Queued" } });
      if (!emailRecord) throw new Error("Queued email record not found");
      const trackingToken = createTrackingToken(job.userId, emailRecord.id);
      const token = createUnsubscribeToken(job.userId, emailRecord.id);
      const appUrl = env.APP_URL;
      const emailWithUnsub = `${body}\n\n---\nUnsubscribe: ${appUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
      const rendered = renderEmailHtml(emailWithUnsub, {}, { trackingUrl: (url, index) => `${appUrl}/api/tracking/click?token=${encodeURIComponent(trackingToken)}&element=link-${index}&url=${encodeURIComponent(url)}`, pixelUrl: `${appUrl}/api/tracking/open?token=${encodeURIComponent(trackingToken)}` });
      const result = await sendEmail(job.userId, { to: lead.email, subject, body: emailWithUnsub, html: rendered.html });
      if (!result.ok) throw new Error(result.error);
      await prisma.emailMessage.update({ where: { id: emailRecord.id }, data: { status: EMAIL_STATUS.SENT, providerMessageId: result.providerMessageId, sentAt: new Date(), trackingToken } });
      await completeJob(job, payload, result.providerMessageId);
      sent++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Send failed";
      if (job.attempts >= job.maxAttempts) {
        await prisma.sendJob.update({ where: { id: job.id }, data: { status: "Failed", lastError: message, lockUntil: null } });
        await failPayload(job.id, payloadFor(job), message);
      } else {
        await prisma.sendJob.update({ where: { id: job.id }, data: { status: "Retry", lastError: message, nextRunAt: new Date(Date.now() + 60_000 * 2 ** (job.attempts - 1)), lockUntil: null } });
      }
    }
  }
  return { processed: jobs.length, sent, failed };
}

function payloadFor(job: { payload: string }): SendPayload {
  try { return JSON.parse(job.payload) as SendPayload; } catch { return {} as SendPayload; }
}

async function completeJob(job: { id: string }, payload: SendPayload, providerMessageId: string) {
  const now = new Date();
  await prisma.sendJob.update({ where: { id: job.id }, data: { status: "Sent", providerMessageId, processedAt: now, lastError: null, lockUntil: null } });
  if (payload.campaignLeadId) {
    await prisma.campaignLead.update({ where: { id: payload.campaignLeadId }, data: { status: "Sent", sentAt: now } });
    await prisma.lead.update({ where: { id: payload.leadId }, data: { status: "Contacted", lastContactAt: now, nextFollowUpAt: daysFromNow(4) } });
  }
  if (payload.enrollmentId) {
    const enrollment = await prisma.journeyEnrollment.findUnique({ where: { id: payload.enrollmentId }, include: { sequence: { include: { steps: { where: { enabled: true }, orderBy: { position: "asc" } } } } } });
    if (enrollment) {
      const nextIndex = enrollment.currentStep + 1;
      const nextStep = enrollment.sequence.steps[nextIndex];
      await prisma.journeyEnrollment.update({ where: { id: enrollment.id }, data: nextStep ? { currentStep: nextIndex, nextRunAt: new Date(Date.now() + nextStep.delayDays * 86_400_000), lastError: null } : { currentStep: nextIndex, status: "Completed", nextRunAt: null, lastError: null } });
    }
  }
}

async function markSkipped(job: { id: string }, payload: SendPayload, reason: string) {
  await prisma.sendJob.update({ where: { id: job.id }, data: { status: "Skipped", lastError: reason, lockUntil: null, processedAt: new Date() } });
  if (payload.campaignLeadId) await prisma.campaignLead.update({ where: { id: payload.campaignLeadId }, data: { status: "Skipped" } });
  if (payload.emailId) await prisma.emailMessage.update({ where: { id: payload.emailId }, data: { status: "Failed", errorMessage: reason } });
  if (payload.enrollmentId) await prisma.journeyEnrollment.update({ where: { id: payload.enrollmentId }, data: { status: "Cancelled", nextRunAt: null, lastError: reason } });
}

async function failPayload(jobId: string, payload: SendPayload, reason: string) {
  if (payload.campaignLeadId) await prisma.campaignLead.update({ where: { id: payload.campaignLeadId }, data: { status: "Skipped" } });
  if (payload.emailId) await prisma.emailMessage.update({ where: { id: payload.emailId }, data: { status: "Failed", errorMessage: reason } });
  if (payload.enrollmentId) await prisma.journeyEnrollment.update({ where: { id: payload.enrollmentId }, data: { status: "Failed", nextRunAt: null, lastError: reason } });
  void jobId;
}
