import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).optional(),
  subject: z.string().trim().min(1).max(500).optional(),
  body: z.string().trim().min(1).max(50000).optional(),
  documentJson: z.string().max(200000).optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const template = await prisma.emailTemplate.findFirst({ where: { id, userId: user.id } });
    if (!template) return notFound("Template not found");
    return ok({ template });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.emailTemplate.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Template not found");
    const body = await readJson(req);
    const d = updateSchema.parse(body);
    const template = await prisma.emailTemplate.update({ where: { id }, data: d });
    const latest = await prisma.emailTemplateVersion.findFirst({ where: { templateId: id }, orderBy: { version: "desc" } });
    await prisma.emailTemplateVersion.create({ data: { templateId: id, version: (latest?.version ?? 0) + 1, subject: template.subject, body: template.body, documentJson: template.documentJson, createdBy: user.id } });
    return ok({ template });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.emailTemplate.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Template not found");
    await prisma.emailTemplate.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
