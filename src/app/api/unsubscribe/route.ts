import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_LEAD_STATUS, SUPPRESSION_REASON } from "@/lib/status";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

async function processToken(token: string): Promise<boolean> {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return false;
  const lead = await prisma.lead.findFirst({ where: { id: parsed.leadId, userId: parsed.userId, email: parsed.email }, select: { id: true, email: true } });
  if (!lead?.email) return false;
  await prisma.$transaction([
    prisma.suppression.upsert({ where: { userId_email: { userId: parsed.userId, email: lead.email } }, create: { userId: parsed.userId, email: lead.email, reason: SUPPRESSION_REASON.UNSUBSCRIBED }, update: { reason: SUPPRESSION_REASON.UNSUBSCRIBED } }),
    prisma.lead.updateMany({ where: { id: lead.id, userId: parsed.userId }, data: { status: "Unsubscribed" } }),
    prisma.emailMessage.updateMany({ where: { userId: parsed.userId, leadId: lead.id, status: { in: ["Queued", "Draft"] } }, data: { status: "Unsubscribed" } }),
    prisma.campaignLead.updateMany({ where: { leadId: lead.id, campaign: { userId: parsed.userId }, status: "Pending" }, data: { status: CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED } }),
    prisma.followUp.updateMany({ where: { userId: parsed.userId, leadId: lead.id, status: "Pending" }, data: { status: "Cancelled" } }),
  ]);
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { token?: unknown };
    const ok = typeof body.token === "string" && await processToken(body.token);
    return NextResponse.json({ ok }, { status: ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const success = await processToken(token);
  return new NextResponse(
    `<html><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh"><div style="text-align:center"><h1>${success ? "You're unsubscribed" : "Invalid unsubscribe link"}</h1><p>${success ? "You will no longer receive emails from this sender." : "This link is invalid or expired."}</p></div></body></html>`,
    { status: success ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
