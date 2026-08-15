import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SUPPRESSION_REASON, CAMPAIGN_LEAD_STATUS } from "@/lib/status";
import { verifyUnsubscribeToken, type UnsubscribePayload } from "@/lib/unsubscribe";

async function processUnsubscribe(payload: UnsubscribePayload): Promise<boolean> {
  const lead = await prisma.lead.findFirst({
    where: { id: payload.leadId, userId: payload.userId, email: payload.email },
    select: { id: true, userId: true, email: true },
  });
  if (!lead) return false;

  await prisma.$transaction([
    prisma.suppression.upsert({
      where: { userId_email: { userId: lead.userId, email: payload.email } },
      create: { userId: lead.userId, email: payload.email, reason: SUPPRESSION_REASON.UNSUBSCRIBED },
      update: { reason: SUPPRESSION_REASON.UNSUBSCRIBED },
    }),
    prisma.lead.update({ where: { id: lead.id }, data: { status: "Unsubscribed" } }),
    prisma.campaignLead.updateMany({
      where: { leadId: lead.id, campaign: { userId: lead.userId }, status: "Pending" },
      data: { status: CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED },
    }),
    prisma.followUp.updateMany({
      where: { userId: lead.userId, leadId: lead.id, status: "Pending" },
      data: { status: "Cancelled" },
    }),
  ]);
  return true;
}

function htmlResponse(ok: boolean, status = ok ? 200 : 400): NextResponse {
  return new NextResponse(
    `<html><body style='font-family:sans-serif;display:grid;place-items:center;height:100vh;'><div style='text-align:center'><h1>${ok ? "You're unsubscribed" : "Invalid unsubscribe link"}</h1><p>${ok ? "You will no longer receive emails from this sender." : "This unsubscribe link is invalid or expired."}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return NextResponse.json({ error: "Invalid or expired unsubscribe token" }, { status: 400 });
  const changed = await processUnsubscribe(payload);
  return NextResponse.json({ ok: changed }, { status: changed ? 200 : 404 });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const payload = verifyUnsubscribeToken(token);
  if (!payload) return htmlResponse(false);
  return htmlResponse(await processUnsubscribe(payload));
}
