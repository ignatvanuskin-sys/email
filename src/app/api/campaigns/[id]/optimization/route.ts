import { z } from "zod";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ frequencyCap: z.number().int().min(1).max(100).nullable().optional(), frequencyWindowDays: z.number().int().min(1).max(90).nullable().optional(), sendTimeOptimization: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } }); if (!campaign) return notFound("Campaign not found"); const data = schema.parse(await readJson(req)); const updated = await prisma.campaign.update({ where: { id }, data }); return ok({ optimization: { frequencyCap: updated.frequencyCap, frequencyWindowDays: updated.frequencyWindowDays, sendTimeOptimization: updated.sendTimeOptimization } }); } catch (error) { return handleError(error); }
}
