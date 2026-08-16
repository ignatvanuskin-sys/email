import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id, versionId } = await params; const template = await prisma.emailTemplate.findFirst({ where: { id, userId: user.id } }); if (!template) return notFound("Template not found"); const version = await prisma.emailTemplateVersion.findFirst({ where: { id: versionId, templateId: id } }); if (!version) return notFound("Template version not found"); const updated = await prisma.emailTemplate.update({ where: { id }, data: { subject: version.subject, body: version.body, documentJson: version.documentJson } }); return ok({ template: updated }); } catch (error) { return handleError(error); }
}
