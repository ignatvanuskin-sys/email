import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_LEAD_STATUS, SUPPRESSION_REASON } from "@/lib/status";
import { parseUnsubscribeToken } from "@/lib/webhookSecurity";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

async function processToken(token: string): Promise<boolean> {
  // New path: messageId token (webhookSecurity, used by sendPipeline/journey)
  const parsed = parseUnsubscribeToken(token);
  if (parsed) {
    const message = await prisma.emailMessage.findFirst({ where: { id: parsed.messageId, userId: parsed.userId }, include: { lead: true } });
    const email = message?.lead.email?.trim().toLowerCase();
    if (message && email) {
      await prisma.$transaction([
        prisma.suppression.upsert({ where: { userId_email: { userId: parsed.userId, email } }, create: { userId: parsed.userId, email, reason: SUPPRESSION_REASON.UNSUBSCRIBED }, update: { reason: SUPPRESSION_REASON.UNSUBSCRIBED } }),
        prisma.lead.update({ where: { id: message.lead.id }, data: { status: "Unsubscribed" } }),
        prisma.emailMessage.update({ where: { id: message.id }, data: { status: "Unsubscribed" } }),
        prisma.campaignLead.updateMany({ where: { leadId: message.lead.id, status: "Pending" }, data: { status: CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED } }),
        prisma.followUp.updateMany({ where: { userId: parsed.userId, leadId: message.lead.id, status: "Pending" }, data: { status: "Cancelled" } }),
      ]);
      return true;
    }
  }
  // Legacy/approve path: leadId+email token (unsubscribe.ts, used by approve footer & smoke)
  const legacy = verifyUnsubscribeToken(token);
  if (legacy) {
    const lead = await prisma.lead.findFirst({ where: { id: legacy.leadId, userId: legacy.userId } });
    const email = legacy.email.trim().toLowerCase();
    if (!lead || !email || lead.email?.trim().toLowerCase() !== email) return false;
    await prisma.$transaction([
      prisma.suppression.upsert({ where: { userId_email: { userId: legacy.userId, email } }, create: { userId: legacy.userId, email, reason: SUPPRESSION_REASON.UNSUBSCRIBED }, update: { reason: SUPPRESSION_REASON.UNSUBSCRIBED } }),
      prisma.lead.update({ where: { id: lead.id }, data: { status: "Unsubscribed" } }),
      prisma.campaignLead.updateMany({ where: { leadId: lead.id, status: "Pending" }, data: { status: CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED } }),
      prisma.followUp.updateMany({ where: { userId: legacy.userId, leadId: lead.id, status: "Pending" }, data: { status: "Cancelled" } }),
    ]);
    return true;
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { token?: unknown };
    const ok = typeof body.token === "string" && await processToken(body.token);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const success = await processToken(token);
  return new NextResponse(
    `<html><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h1>${success ? "You're unsubscribed" : "Invalid unsubscribe link"}</h1><p>${success ? "You will no longer receive emails from this sender." : "This link is invalid. Contact the sender if you still receive email."}</p></div></body></html>`,
    { status: success ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
