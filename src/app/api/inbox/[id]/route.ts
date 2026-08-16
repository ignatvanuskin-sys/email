import { z } from "zod";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ isRead: z.boolean().optional(), archived: z.boolean().optional(), classification: z.string().max(50).optional() });
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) { try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const reply = await prisma.reply.findFirst({ where: { id, userId: user.id } }); if (!reply) return notFound("Reply not found"); const data = schema.parse(await readJson(req)); const updated = await prisma.reply.update({ where: { id }, data: { isRead: data.isRead, archivedAt: data.archived === undefined ? undefined : data.archived ? new Date() : null, classification: data.classification } }); return ok({ reply: { id: updated.id, isRead: updated.isRead, archivedAt: updated.archivedAt?.toISOString() ?? null, classification: updated.classification } }); } catch (error) { return handleError(error); } }
