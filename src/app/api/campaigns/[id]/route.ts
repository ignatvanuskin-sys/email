import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";
import { createCampaignVersion } from "@/lib/campaignVersions";
import { ensureWorkspace, roleCan, writeAudit } from "@/lib/workspace";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  dailyLimit: z.number().int().positive().optional(),
  templateId: z.string().optional().nullable(),
  sequenceId: z.string().optional().nullable(),
  segmentId: z.string().optional().nullable(),
  frequencyCap: z.number().int().min(1).max(100).optional().nullable(),
  frequencyWindowDays: z.number().int().min(1).max(90).optional().nullable(),
  sendTimeOptimization: z.boolean().optional(),
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
    return ok({ campaign: { ...campaign, approvalExpiresAt: campaign.approvalExpiresAt?.toISOString() ?? null }, leads, variants });
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
    const workspace = await ensureWorkspace(user);
    const membership = workspace.memberships.find((item) => item.userId === user.id);
    if (!membership || !roleCan(membership.role, "Marketer")) return badRequest("Your workspace role cannot edit campaigns");
    if (existing.status !== "Draft" && existing.status !== "Paused") {
      return badRequest("Only draft or paused campaigns can be edited");
    }
    const body = await readJson(req);
    const d = updateSchema.parse(body);
    const campaign = await prisma.campaign.update({ where: { id }, data: { ...d, activeVersionId: null, approvalHash: null, approvalExpiresAt: null } });
    await createCampaignVersion(user.id, id);
    await writeAudit(user.id, "campaign.updated", "Campaign", id, { fields: Object.keys(d) }, workspace.id);
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
