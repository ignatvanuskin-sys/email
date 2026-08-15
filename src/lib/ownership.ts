import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { PublicError } from "./errors";

export async function validateCampaignReferences(
  userId: string,
  refs: { templateId?: string | null; sequenceId?: string | null; segmentId?: string | null },
): Promise<void> {
  if (refs.templateId) {
    const template = await prisma.emailTemplate.findFirst({ where: { id: refs.templateId, userId }, select: { id: true } });
    if (!template) throw new PublicError("Template not found");
  }
  if (refs.sequenceId) {
    const sequence = await prisma.sequence.findFirst({ where: { id: refs.sequenceId, userId }, select: { id: true } });
    if (!sequence) throw new PublicError("Sequence not found");
  }
  if (refs.segmentId) {
    const segment = await prisma.segment.findFirst({ where: { id: refs.segmentId, userId }, select: { id: true } });
    if (!segment) throw new PublicError("Segment not found");
  }
}

export async function compileSegmentWhere(userId: string, segmentId: string): Promise<Prisma.LeadWhereInput> {
  const segment = await prisma.segment.findFirst({ where: { id: segmentId, userId } });
  if (!segment) throw new PublicError("Linked segment not found");

  const filters = JSON.parse(segment.filters || "[]") as Array<{ field?: string; op?: string; value?: string }>;
  const where: Prisma.LeadWhereInput = { userId };
  for (const filter of filters) {
    if (filter.field === "status" && filter.value) where.status = filter.value;
    if (filter.field === "score" && filter.value) {
      const min = Number.parseInt(filter.value, 10);
      if (Number.isFinite(min)) where.leadScore = { gte: min };
    }
  }
  return where;
}
