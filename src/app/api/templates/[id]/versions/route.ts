import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const template = await prisma.emailTemplate.findFirst({ where: { id, userId: user.id } }); if (!template) return notFound("Template not found"); const versions = await prisma.emailTemplateVersion.findMany({ where: { templateId: id }, orderBy: { version: "desc" }, select: { id: true, version: true, subject: true, body: true, documentJson: true, createdBy: true, createdAt: true } }); return ok({ versions: versions.map((version) => ({ ...version, createdAt: version.createdAt.toISOString() })) }); } catch (error) { return handleError(error); }
}
