import { z } from "zod";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ channel: z.enum(["email", "telegram"]).optional(), conditionJson: z.string().max(10000).nullable().optional(), goalEventType: z.string().max(120).nullable().optional(), exitEventType: z.string().max(120).nullable().optional() });
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) { try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const sequence = await prisma.sequence.findFirst({ where: { id, userId: user.id } }); if (!sequence) return notFound("Sequence not found"); const data = schema.parse(await readJson(req)); const updated = await prisma.sequence.update({ where: { id }, data }); return ok({ automation: { channel: updated.channel, conditionJson: updated.conditionJson, goalEventType: updated.goalEventType, exitEventType: updated.exitEventType } }); } catch (error) { return handleError(error); } }
