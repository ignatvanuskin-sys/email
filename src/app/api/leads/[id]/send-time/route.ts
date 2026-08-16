import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { recommendedSendHour } from "@/lib/frequencyGuard";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const lead = await prisma.lead.findFirst({ where: { id, userId: user.id } }); if (!lead) return notFound("Lead not found"); return ok({ recommendation: await recommendedSendHour(user.id, id) }); } catch (error) { return handleError(error); }
}
