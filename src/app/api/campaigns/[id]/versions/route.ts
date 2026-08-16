import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { createCampaignVersion } from "@/lib/campaignVersions";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } }); if (!campaign) return notFound("Campaign not found"); const versions = await prisma.campaignVersion.findMany({ where: { campaignId: id }, orderBy: { version: "desc" }, select: { id: true, version: true, contentHash: true, createdBy: true, createdAt: true } }); return ok({ versions: versions.map((version) => ({ ...version, createdAt: version.createdAt.toISOString() })) }); } catch (error) { return handleError(error); }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const { id } = await params; const version = await createCampaignVersion(user.id, id); if (!version) return notFound("Campaign not found"); return ok({ version: { id: version.id, version: version.version, contentHash: version.contentHash, createdAt: version.createdAt.toISOString() } }, 201); } catch (error) { return handleError(error); }
}
