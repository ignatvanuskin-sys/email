import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { validateCampaignReferences } from "@/lib/ownership";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  dailyLimit: z.number().int().positive().optional(),
  templateId: z.string().optional().nullable(),
  sequenceId: z.string().optional().nullable(),
  segmentId: z.string().optional().nullable(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const [leads, variants] = await Promise.all([
      prisma.campaignLead.findMany({ where: { campaignId: id }, include: { lead: true } }),
      prisma.campaignVariant.findMany({ where: { campaignId: id } }),
    ]);
    return ok({ campaign, leads, variants });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Campaign not found");
    if (existing.status !== "Draft" && existing.status !== "Paused") {
      return badRequest("Only draft or paused campaigns can be edited");
    }
    const body = await readJson(req);
    const d = updateSchema.parse(body);
    await validateCampaignReferences(user.id, d);
    const campaign = await prisma.campaign.update({ where: { id }, data: d });
    return ok({ campaign });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const existing = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!existing) return notFound("Campaign not found");
    await prisma.$transaction([
      prisma.campaignLead.deleteMany({ where: { campaignId: id } }),
      prisma.campaignVariant.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.delete({ where: { id } }),
    ]);
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}