import { prisma } from "./prisma";
import { CAMPAIGN_LEAD_STATUS, SUPPRESSION_REASON } from "./status";

export type SuppressionEventType = "bounce" | "complaint";

export async function processSuppressionEvent(input: {
  providerEventId: string;
  type: SuppressionEventType;
  email?: string;
  emailMessageId?: string;
  payload?: unknown;
}): Promise<{ processed: boolean }> {
  const existing = await prisma.inboundEmailEvent.findUnique({ where: { providerEventId: input.providerEventId } });
  if (existing) return { processed: false };

  const message = input.emailMessageId ? await prisma.emailMessage.findUnique({ where: { id: input.emailMessageId }, include: { lead: true } }) : null;
  const email = (input.email ?? message?.lead.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("A recipient email or emailMessageId is required");
  const userId = message?.userId ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.inboundEmailEvent.create({ data: {
      providerEventId: input.providerEventId,
      userId,
      email,
      type: input.type,
      payload: JSON.stringify(input.payload ?? {}),
    } });
    const leads = await tx.lead.findMany({ where: { email, ...(userId ? { userId } : {}) }, select: { id: true, userId: true } });
    for (const lead of leads) {
      await tx.suppression.upsert({
        where: { userId_email: { userId: lead.userId, email } },
        create: { userId: lead.userId, email, reason: input.type === "bounce" ? SUPPRESSION_REASON.HARD_BOUNCE : SUPPRESSION_REASON.COMPLAINT },
        update: { reason: input.type === "bounce" ? SUPPRESSION_REASON.HARD_BOUNCE : SUPPRESSION_REASON.COMPLAINT },
      });
      await tx.lead.update({ where: { id: lead.id }, data: { status: input.type === "bounce" ? "Lost" : "Unsubscribed" } });
      await tx.campaignLead.updateMany({ where: { leadId: lead.id, status: "Pending" }, data: { status: input.type === "bounce" ? CAMPAIGN_LEAD_STATUS.BOUNCED : CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED } });
      await tx.followUp.updateMany({ where: { userId: lead.userId, leadId: lead.id, status: "Pending" }, data: { status: "Cancelled" } });
    }
    if (message) await tx.emailMessage.update({ where: { id: message.id }, data: { status: input.type === "bounce" ? "Bounced" : "Unsubscribed", errorMessage: input.type === "bounce" ? "Hard bounce reported" : "Complaint reported" } });
  });
  return { processed: true };
}
