import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).optional(),
  filters: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const segment = await prisma.segment.findFirst({ where: { id, userId: user.id } });
    if (!segment) return notFound("Segment not found");
    // Resolve leads matching segment
    const filters = JSON.parse(segment.filters || "[]") as Array<{ field: string; op: string; value: string }>;
    const where: Record<string, unknown> = { userId: user.id };
    for (const f of filters) {
      if (f.field === "status" && f.value) where.status = f.value;
      if (f.field === "score" && f.value) {
        const min = parseInt(f.value);
        if (!isNaN(min)) where.leadScore = { gte: min };
      }
    }
    const leads = await prisma.lead.findMany({ where: where as Prisma.LeadWhereInput, orderBy: { leadScore: "desc" }, take: 1000 });
    return ok({ segment, leads: leads.map((l) => ({ id: l.id, name: l.name, email: l.email, leadScore: l.leadScore, status: l.status })) });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.segment.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Segment not found");
    const body = await readJson(req);
    const d = updateSchema.parse(body);
    const segment = await prisma.segment.update({ where: { id }, data: d });
    return ok({ segment });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.segment.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Segment not found");
    await prisma.segment.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}