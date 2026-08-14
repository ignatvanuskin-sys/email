import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { replyCreateSchema } from "@/lib/validation";
import { REPLY_CLASSIFICATION, LEAD_STATUS } from "@/lib/status";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const replies = await prisma.reply.findMany({
      where: { userId: user.id },
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, name: true, companyOrChannel: true, email: true } } },
    });
    return ok({
      replies: replies.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        classification: r.classification,
        contentSnippet: r.contentSnippet,
        receivedAt: r.receivedAt.toISOString(),
        lead: r.lead,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

// Simulates an incoming reply (MVP has no inbox yet) and applies the
// follow-up auto-cancel rule (spec §14.4 / §19).
export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = replyCreateSchema.parse(body);

    const lead = await prisma.lead.findFirst({ where: { id: d.leadId, userId: user.id } });
    if (!lead) return notFound("Lead not found");

    let newStatus: string = LEAD_STATUS.REPLIED;
    if (d.classification === REPLY_CLASSIFICATION.UNSUBSCRIBE) {
      newStatus = LEAD_STATUS.UNSUBSCRIBED;
      if (lead.email) {
        await prisma.suppression.upsert({
          where: { userId_email: { userId: user.id, email: lead.email.toLowerCase() } },
          create: { userId: user.id, email: lead.email.toLowerCase(), reason: "Unsubscribed" },
          update: {},
        });
      }
    } else if (d.classification === REPLY_CLASSIFICATION.INTERESTED) {
      newStatus = LEAD_STATUS.INTERESTED;
    } else if (d.classification === REPLY_CLASSIFICATION.NOT_NOW) {
      newStatus = LEAD_STATUS.NOT_NOW;
    }

    const reply = await prisma.reply.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        emailMessageId: d.emailMessageId ?? null,
        classification: d.classification,
        contentSnippet: d.contentSnippet || "(no content)",
      },
    });

    await prisma.$transaction([
      prisma.lead.update({ where: { id: lead.id }, data: { status: newStatus } }),
      // Any reply cancels pending follow-ups on that lead (spec §19 critical rule).
      prisma.followUp.updateMany({
        where: { userId: user.id, leadId: lead.id, status: "Pending" },
        data: { status: "Cancelled" },
      }),
      // Any reply stops future campaign sends to this lead (v1.1 sequence rule).
      prisma.campaignLead.updateMany({
        where: { leadId: lead.id, status: "Pending" },
        data: { status: "Replied", repliedAt: new Date() },
      }),
      prisma.activity.create({
        data: {
          userId: user.id,
          leadId: lead.id,
          type: "ReplyReceived",
          payload: JSON.stringify({ classification: d.classification }),
        },
      }),
    ]);

    return ok({ reply: { id: reply.id, leadId: lead.id, classification: d.classification, newStatus } }, 201);
  } catch (err) {
    return handleError(err);
  }
}