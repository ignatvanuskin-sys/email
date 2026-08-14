import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { suppressionCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const entries = await prisma.suppression.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return ok({ entries: entries.map((e) => ({ id: e.id, email: e.email, reason: e.reason, createdAt: e.createdAt.toISOString() })) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = suppressionCreateSchema.parse(body);
    const email = d.email.toLowerCase().trim();

    // Mirror: any lead already holding this email gets moved to Unsubscribed,
    // and pending follow-ups are cancelled immediately.
    const leads = await prisma.lead.findMany({
      where: { userId: user.id, email },
      select: { id: true },
    });
    const leadIds = leads.map((lead) => lead.id);
    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { userId: user.id, id: { in: leadIds } },
        data: { status: "Unsubscribed" },
      }),
      prisma.followUp.updateMany({
        where: { userId: user.id, leadId: { in: leadIds }, status: "Pending" },
        data: { status: "Cancelled" },
      }),
    ]);

    const entry = await prisma.suppression.upsert({
      where: { userId_email: { userId: user.id, email } },
      create: { userId: user.id, email, reason: d.reason },
      update: { reason: d.reason },
    });

    return ok({ entry: { id: entry.id, email: entry.email, reason: entry.reason } }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return badRequest("id is required");
    await prisma.suppression.deleteMany({ where: { id, userId: user.id } });
    return ok({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}