import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { SUPPRESSION_REASON, CAMPAIGN_LEAD_STATUS } from "@/lib/status";
import { verifySignedWebhook } from "@/lib/webhook";

const schema = z.object({
  emailMessageId: z.string().min(1),
  event: z.enum(["bounce", "complaint"]).default("bounce"),
});

// Provider webhook: request body must be HMAC-signed with a fresh timestamp.
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySignedWebhook(req, rawBody)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  try {
    const d = schema.parse(JSON.parse(rawBody));
    const emailRecord = await prisma.emailMessage.findUnique({ where: { id: d.emailMessageId } });
    if (!emailRecord) return NextResponse.json({ ok: true });

    const lead = await prisma.lead.findFirst({
      where: { id: emailRecord.leadId, userId: emailRecord.userId },
      select: { id: true, userId: true, email: true },
    });
    if (!lead?.email) return NextResponse.json({ ok: true });

    const isComplaint = d.event === "complaint";
    const emailStatus = isComplaint ? "Unsubscribed" : "Bounced";
    const leadStatus = isComplaint ? "Unsubscribed" : "Lost";
    const campaignStatus = isComplaint ? CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED : CAMPAIGN_LEAD_STATUS.BOUNCED;
    const suppressionReason = isComplaint ? SUPPRESSION_REASON.COMPLAINT : SUPPRESSION_REASON.HARD_BOUNCE;
    const email = lead.email.toLowerCase().trim();

    await prisma.$transaction([
      prisma.emailMessage.update({
        where: { id: emailRecord.id },
        data: { status: emailStatus, errorMessage: isComplaint ? "Complaint reported" : "Hard bounce reported" },
      }),
      prisma.suppression.upsert({
        where: { userId_email: { userId: lead.userId, email } },
        create: { userId: lead.userId, email, reason: suppressionReason },
        update: { reason: suppressionReason },
      }),
      prisma.lead.update({ where: { id: lead.id }, data: { status: leadStatus } }),
      prisma.campaignLead.updateMany({
        where: { leadId: lead.id, campaign: { userId: lead.userId }, status: "Pending" },
        data: { status: campaignStatus },
      }),
      prisma.followUp.updateMany({
        where: { userId: lead.userId, leadId: lead.id, status: "Pending" },
        data: { status: "Cancelled" },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
