import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { SUPPRESSION_REASON, CAMPAIGN_LEAD_STATUS } from "@/lib/status";

const schema = z.object({
  email: z.string().email(),
  reason: z.string().optional().default("Unsubscribed"),
});

// Applies an unsubscribe for every owner of a lead with this email address.
async function processUnsubscribe(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return;

  const leads = await prisma.lead.findMany({ where: { email: normalizedEmail }, select: { id: true, userId: true } });

  for (const lead of leads) {
    await prisma.suppression.upsert({
      where: { userId_email: { userId: lead.userId, email: normalizedEmail } },
      create: { userId: lead.userId, email: normalizedEmail, reason: SUPPRESSION_REASON.UNSUBSCRIBED },
      update: {},
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "Unsubscribed" },
    });
    await prisma.campaignLead.updateMany({
      where: { leadId: lead.id, status: "Pending" },
      data: { status: CAMPAIGN_LEAD_STATUS.UNSUBSCRIBED },
    });
    await prisma.followUp.updateMany({
      where: { userId: lead.userId, leadId: lead.id, status: "Pending" },
      data: { status: "Cancelled" },
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);
    await processUnsubscribe(email);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") || "";
  if (email) {
    await processUnsubscribe(email);
  }
  return new NextResponse(
    "<html><body style='font-family:sans-serif;display:grid;place-items:center;height:100vh;'><div style='text-align:center'><h1>You're unsubscribed</h1><p>You will no longer receive emails from this sender.</p></div></body></html>",
    { headers: { "content-type": "text/html" } },
  );
}