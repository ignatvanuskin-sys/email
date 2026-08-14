import { prisma } from "./prisma";
import { SUPPRESSED_LEAD_STATUSES, type LeadStatus } from "./status";

export type SuppressionCheck = {
  allowed: boolean;
  reason: "ok" | "suppressed" | "lead_status" | "no_email";
};

// Hard gate before ANY outbound email for a lead/address.
// Applies to real sends and queueing alike (spec §14.3, §17, §21).
export async function checkSuppression(
  userId: string,
  email: string | null | undefined,
  leadId?: string,
): Promise<SuppressionCheck> {
  if (!email) return { allowed: false, reason: "no_email" };

  const suppressed = await prisma.suppression.findUnique({
    where: { userId_email: { userId, email: email.toLowerCase() } },
  });
  if (suppressed) return { allowed: false, reason: "suppressed" };

  if (leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, userId } });
    if (lead && SUPPRESSED_LEAD_STATUSES.includes(lead.status as LeadStatus)) {
      return { allowed: false, reason: "lead_status" };
    }
  }

  return { allowed: true, reason: "ok" };
}