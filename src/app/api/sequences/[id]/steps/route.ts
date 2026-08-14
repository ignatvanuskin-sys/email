import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";

const stepSchema = z.object({
  position: z.number().int().min(0).optional(),
  delayDays: z.number().int().min(0).max(90).optional().default(3),
  templateId: z.string().optional().nullable().default(null),
  subject: z.string().max(500).optional().default(""),
  body: z.string().max(50000).optional().default(""),
  enabled: z.boolean().optional().default(true),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const seq = await prisma.sequence.findFirst({ where: { id, userId: user.id } });
    if (!seq) return notFound("Sequence not found");
    const steps = await prisma.sequenceStep.findMany({ where: { sequenceId: id }, orderBy: { position: "asc" } });
    return ok({ steps });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const seq = await prisma.sequence.findFirst({ where: { id, userId: user.id } });
    if (!seq) return notFound("Sequence not found");
    const body = await readJson(req);
    const d = stepSchema.parse(body);
    const maxPos = await prisma.sequenceStep.aggregate({ where: { sequenceId: id }, _max: { position: true } });
    const step = await prisma.sequenceStep.create({
      data: {
        sequenceId: id,
        position: d.position ?? (maxPos._max.position ?? -1) + 1,
        delayDays: d.delayDays,
        templateId: d.templateId,
        subject: d.subject,
        body: d.body,
        enabled: d.enabled,
      },
    });
    return ok({ step }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const seq = await prisma.sequence.findFirst({ where: { id, userId: user.id } });
    if (!seq) return notFound("Sequence not found");
    const body = await readJson(req);
    const { stepId, ...data } = body as { stepId: string } & Record<string, unknown>;
    if (!stepId) return badRequest("stepId is required");
    const step = await prisma.sequenceStep.updateMany({ where: { id: stepId, sequenceId: id }, data });
    return ok({ updated: step.count });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const seq = await prisma.sequence.findFirst({ where: { id, userId: user.id } });
    if (!seq) return notFound("Sequence not found");
    const url = new URL(req.url);
    const stepId = url.searchParams.get("stepId");
    if (!stepId) return badRequest("stepId is required");
    await prisma.sequenceStep.delete({ where: { id: stepId } });
    // Reorder remaining steps
    const remaining = await prisma.sequenceStep.findMany({ where: { sequenceId: id }, orderBy: { position: "asc" } });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.sequenceStep.update({ where: { id: remaining[i].id }, data: { position: i } });
    }
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}