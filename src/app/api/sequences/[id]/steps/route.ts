import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";

const stepCreateSchema = z.object({
  position: z.number().int().min(0).optional(),
  delayDays: z.number().int().min(0).max(90).default(3),
  templateId: z.string().optional().nullable().default(null),
  subject: z.string().max(500).default(""),
  body: z.string().max(50000).default(""),
  enabled: z.boolean().default(true),
});

const stepUpdateSchema = stepCreateSchema.partial();

async function ownedSequence(id: string, userId: string) {
  return prisma.sequence.findFirst({ where: { id, userId }, select: { id: true } });
}

async function ensureTemplateOwned(templateId: string | null | undefined, userId: string): Promise<void> {
  if (!templateId) return;
  const template = await prisma.emailTemplate.findFirst({ where: { id: templateId, userId }, select: { id: true } });
  if (!template) throw new Error("Template not found");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    if (!await ownedSequence(id, user.id)) return notFound("Sequence not found");
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
    if (!await ownedSequence(id, user.id)) return notFound("Sequence not found");
    const body = await readJson(req);
    const d = stepCreateSchema.parse(body);
    await ensureTemplateOwned(d.templateId, user.id);
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
    if (!await ownedSequence(id, user.id)) return notFound("Sequence not found");
    const body = await readJson(req);
    const stepId = typeof body === "object" && body && typeof (body as { stepId?: unknown }).stepId === "string"
      ? (body as { stepId: string }).stepId
      : null;
    if (!stepId) return badRequest("stepId is required");
    const parsed = stepUpdateSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues.map((issue) => issue.message).join("; "));
    await ensureTemplateOwned(parsed.data.templateId, user.id);
    const step = await prisma.sequenceStep.updateMany({ where: { id: stepId, sequenceId: id }, data: parsed.data });
    if (step.count === 0) return notFound("Step not found");
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
    if (!await ownedSequence(id, user.id)) return notFound("Sequence not found");
    const stepId = new URL(req.url).searchParams.get("stepId");
    if (!stepId) return badRequest("stepId is required");

    const step = await prisma.sequenceStep.findFirst({ where: { id: stepId, sequenceId: id, sequence: { userId: user.id } } });
    if (!step) return notFound("Step not found");
    await prisma.sequenceStep.delete({ where: { id: step.id } });
    const remaining = await prisma.sequenceStep.findMany({ where: { sequenceId: id }, orderBy: { position: "asc" } });
    await prisma.$transaction(remaining.map((remainingStep, index) =>
      prisma.sequenceStep.update({ where: { id: remainingStep.id }, data: { position: index } }),
    ));
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
