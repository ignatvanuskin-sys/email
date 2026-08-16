import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { emailSendSchema } from "@/lib/validation";
import { isApprovalValid } from "@/lib/approval";
import { checkSuppression } from "@/lib/suppression";
import { sendEmail } from "@/lib/emailSender";
import { DEFAULT_FOLLOWUP_DELAY_DAYS, EMAIL_STATUS, LEAD_STATUS } from "@/lib/status";
import { daysFromNow } from "@/lib/utils";
import { consumeUsage } from "@/lib/usage";

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const usage = await consumeUsage(user.id, "emails");
    if (!usage.allowed) return badRequest(`Email usage limit reached for this month (${usage.limit})`);

    const body = await readJson(req);
    const d = emailSendSchema.parse(body);

    const email = await prisma.emailMessage.findFirst({ where: { id: d.emailId, userId: user.id } });
    if (!email) return notFound("Email not found");
    if (email.status === "Sent" || email.status === "Sending") {
      return badRequest("This email has already been sent or is currently sending");
    }

    const lead = await prisma.lead.findFirst({ where: { id: email.leadId, userId: user.id } });
    if (!lead) return notFound("Lead not found");
    if (!lead.email) return badRequest("This lead has no email address");

    // Global pause blocks outbound email (spec §14, §17).
    if (user.outreachPaused) return badRequest("Outreach is paused. Enable sending in Настройки first.");

    // Daily limit check (spec §17).
    const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true }, select: { dailyLimit: true } });
    if (provider) {
      const startOfDay = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
      const sentToday = await prisma.emailMessage.count({ where: { userId: user.id, status: "Sent", sentAt: { gte: startOfDay } } });
      if (sentToday >= provider.dailyLimit) {
        return badRequest(`Daily sending limit reached (${provider.dailyLimit} emails/day). Try again tomorrow.`);
      }
    }

    // Human-in-the-loop approval must be valid and unexpired (spec §14.3).
    if (!isApprovalValid(email.id, email.subject, email.body, email.approvalHash, email.approvalExpiresAt)) {
      return badRequest("This email was not approved or the approval expired. Approve it again before sending.");
    }

    // Hard suppression gate right before actual send (spec §17 / §21).
    const check = await checkSuppression(user.id, lead.email, lead.id);
    if (!check.allowed) {
      if (check.reason === "suppressed") {
        return badRequest("This contact has unsubscribed - outreach to them is blocked.");
      }
      return badRequest("Outreach to this lead is blocked by its status.");
    }

    const sending = await prisma.emailMessage.updateMany({
      where: { id: email.id, userId: user.id, status: { notIn: [EMAIL_STATUS.SENT, EMAIL_STATUS.SENDING] } },
      data: { status: EMAIL_STATUS.SENDING },
    });
    if (sending.count !== 1) return badRequest("This email has already been sent or is currently sending");

    const result = await sendEmail(user.id, {
      to: lead.email,
      subject: email.subject,
      body: email.body,
    });

    if (!result.ok) {
      await prisma.emailMessage.update({
        where: { id: email.id },
        data: { status: EMAIL_STATUS.FAILED, errorMessage: result.error },
      });
      return badRequest("This email couldn't be sent. Check your provider connection and try again.");
    }

    const now = new Date();
    const nextFollowUp = daysFromNow(DEFAULT_FOLLOWUP_DELAY_DAYS);

    await prisma.$transaction([
      prisma.emailMessage.update({
        where: { id: email.id },
        data: {
          status: EMAIL_STATUS.SENT,
          providerMessageId: result.providerMessageId,
          sentAt: now,
          errorMessage: null,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LEAD_STATUS.CONTACTED,
          lastContactAt: now,
          nextFollowUpAt: nextFollowUp,
        },
      }),
      prisma.followUp.create({
        data: {
          userId: user.id,
          leadId: lead.id,
          dueDate: nextFollowUp,
          status: "Pending",
          note: `Follow up with ${lead.name}`,
        },
      }),
      prisma.activity.create({
        data: {
          userId: user.id,
          leadId: lead.id,
          type: "EmailSent",
          payload: JSON.stringify({ emailId: email.id }),
        },
      }),
    ]);

    return ok({
      email: { id: email.id, status: EMAIL_STATUS.SENT, providerMessageId: result.providerMessageId },
      leadId: lead.id,
      nextFollowUpAt: nextFollowUp.toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
