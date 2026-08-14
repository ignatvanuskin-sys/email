import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const sequence = await prisma.sequence.findFirst({ where: { id, userId: user.id }, include: { steps: { orderBy: { position: "asc" } } } });
    if (!sequence) return notFound("Sequence not found");
    return ok({ sequence });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.sequence.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Sequence not found");
    const body = await readJson(req);
    const d = updateSchema.parse(body);
    const sequence = await prisma.sequence.update({ where: { id }, data: d });
    return ok({ sequence });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.sequence.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Sequence not found");
    await prisma.$transaction([
      prisma.sequenceStep.deleteMany({ where: { sequenceId: id } }),
      prisma.sequence.delete({ where: { id } }),
    ]);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}