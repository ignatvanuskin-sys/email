import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().trim().min(1).max(120), documentJson: z.string().max(100000) });
export async function GET() { try { const user = await getApiUser(); if (!user) return unauthorized(); return ok({ sections: await prisma.emailReusableSection.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }) }); } catch (error) { return handleError(error); } }
export async function POST(req: Request) { try { const user = await getApiUser(); if (!user) return unauthorized(); const data = schema.parse(await readJson(req)); return ok({ section: await prisma.emailReusableSection.create({ data: { userId: user.id, name: data.name, documentJson: data.documentJson } }) }, 201); } catch (error) { return handleError(error); } }
