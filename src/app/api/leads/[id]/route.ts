import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { leadUpdateSchema } from "@/lib/validation";
import { SUPPRESSION_REASON } from "@/lib/status";
import { mapLead } from "@/lib/serialize";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } });
    if (!lead) return notFound("Lead not found");

    const [emails, followUps, replies, activities] = await Promise.all([
      prisma.emailMessage.findMany({ where: { userId: user.id, leadId: id }, orderBy: { createdAt: "desc" } }),
      prisma.followUp.findMany({ where: { userId: user.id, leadId: id }, orderBy: { dueDate: "asc" } }),
      prisma.reply.findMany({ where: { userId: user.id, leadId: id }, orderBy: { receivedAt: "desc" } }),
      prisma.activity.findMany({ where: { userId: user.id, leadId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);

    return ok({
      lead: mapLead({
        ...lead,
        _count: { emails: emails.length, replies: replies.length, followUps: followUps.length },
      }),
      emails: emails.map((e) => ({
        id: e.id,
        subject: e.subject,
        status: e.status,
        sentAt: e.sentAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
      followUps: followUps.map((f) => ({
        id: f.id,
        dueDate: f.dueDate.toISOString(),
        status: f.status,
        note: f.note,
      })),
      replies,
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        payload: JSON.parse(a.payload || "{}"),
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } });
    if (!lead) return notFound("Lead not found");

    const body = await readJson(req);
    const d = leadUpdateSchema.parse(body);

    const next = leadUpdateSchema.partial().parse(d);

    const data: Record<string, unknown> = {};
    for (const key of ["name", "companyOrChannel", "niche", "followersCount", "contentActivity", "longFormCount", "shortFormCount", "growthSignal", "commercialPotential", "status"] as const) {
      if (key in next && next[key] !== undefined) data[key] = next[key];
    }
    for (const key of ["websiteUrl", "youtubeUrl", "instagramUrl", "telegramUrl"] as const) {
      if (key in next) data[key] = next[key];
    }
    if (next.email !== undefined) {
      data.email = next.email ? next.email.toLowerCase().trim() : null;
    }

    // Safety: transitioning to a suppressed status records a suppression entry (spec §14.1).
    if (next.status === "Unsubscribed" && lead.email) {
      await prisma.suppression.upsert({
        where: { userId_email: { userId: user.id, email: lead.email.toLowerCase() } },
        create: { userId: user.id, email: lead.email.toLowerCase(), reason: SUPPRESSION_REASON.UNSUBSCRIBED },
        update: {},
      });
      await prisma.followUp.updateMany({
        where: { userId: user.id, leadId: id, status: "Pending" },
        data: { status: "Cancelled" },
      });
    }

    const updated = await prisma.lead.update({ where: { id }, data });

    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: id,
        type: "StatusChanged",
        payload: JSON.stringify({ from: lead.status, to: updated.status }),
      },
    });

    return ok({ lead: mapLead(updated) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } });
    if (!lead) return notFound("Lead not found");

    // Full deletion of lead + related data (spec §22).
    await prisma.$transaction([
      prisma.reply.deleteMany({ where: { leadId: id } }),
      prisma.followUp.deleteMany({ where: { leadId: id } }),
      prisma.emailMessage.deleteMany({ where: { leadId: id } }),
      prisma.activity.deleteMany({ where: { leadId: id } }),
      prisma.lead.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}