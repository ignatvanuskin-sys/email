import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { SUPPRESSION_REASON, CAMPAIGN_LEAD_STATUS } from "@/lib/status";

const schema = z.object({
  email: z.string().email().optional(),
  emailMessageId: z.string().optional(),
  event: z.enum(["bounce", "complaint"]).default("bounce"),
});

// Public webhook used by email providers to report hard bounces / complaints.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const d = schema.parse(body);

    let targetEmail: string | null = null;

    if (d.email) {
      targetEmail = d.email.toLowerCase().trim();
    } else if (d.emailMessageId) {
      const emailRecord = await prisma.emailMessage.findUnique({ where: { id: d.emailMessageId } });
      if (emailRecord) {
        const lead = await prisma.lead.findFirst({ where: { id: emailRecord.leadId } });
        if (lead?.email) targetEmail = lead.email.toLowerCase();
        await prisma.emailMessage.update({
          where: { id: emailRecord.id },
          data: { status: d.event === "bounce" ? "Bounced" : "Unsubscribed", errorMessage: d.event === "bounce" ? "Hard bounce reported" : "Complaint reported" },
        });
      }
    }

    if (!targetEmail) return NextResponse.json({ ok: true });

    // Mark any lead with this email as suppressed.
    const leads = await prisma.lead.findMany({ where: { email: targetEmail }, select: { id: true, userId: true } });
    for (const lead of leads) {
      await prisma.suppression.upsert({
        where: { userId_email: { userId: lead.userId, email: targetEmail } },
        create: { userId: lead.userId, email: targetEmail, reason: d.event === "bounce" ? SUPPRESSION_REASON.HARD_BOUNCE : SUPPRESSION_REASON.COMPLAINT },
        update: {},
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: d.event === "bounce" ? "Lost" : "Unsubscribed" },
      });
      // Cancel pending campaign sends to this lead.
      await prisma.campaignLead.updateMany({
        where: { leadId: lead.id, status: "Pending" },
        data: { status: d.event === "bounce" ? CAMPAIGN_LEAD_STATUS.BOUNCED : CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED },
      });
      await prisma.followUp.updateMany({
        where: { userId: lead.userId, leadId: lead.id, status: "Pending" },
        data: { status: "Cancelled" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}