import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, notFound, badRequest } from "@/lib/api";
import { followUpActionSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const followUpId = typeof body === "object" && body && typeof (body as { id?: unknown }).id === "string"
      ? (body as { id: string }).id
      : null;
    if (!followUpId) return badRequest("id is required");

    const d = followUpActionSchema.parse(body);
    const f = await prisma.followUp.findFirst({ where: { id: followUpId, userId: user.id } });
    if (!f) return notFound("Follow-up not found");

    let data: { status: string; dueDate?: Date };
    if (d.action === "reschedule" && d.dueDate) {
      data = { status: "Pending", dueDate: new Date(d.dueDate) };
    } else if (d.action === "cancel") {
      data = { status: "Cancelled" };
    } else if (d.action === "skip") {
      data = { status: "Skipped" };
    } else {
      data = { status: "Completed" };
    }

    const updated = await prisma.followUp.update({ where: { id: f.id }, data });
    return ok({ followUp: { id: updated.id, status: updated.status, dueDate: updated.dueDate.toISOString() } });
  } catch (err) {
    return handleError(err);
  }
}