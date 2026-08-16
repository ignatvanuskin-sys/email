import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { computeCampaignApprovalHash, APPROVAL_TTL_MS } from "@/lib/approval";
import { ensureWorkspace, roleCan, writeAudit } from "@/lib/workspace";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const workspace = await ensureWorkspace(user);
    const membership = workspace.memberships.find((item) => item.userId === user.id);
    if (!membership || !roleCan(membership.role, "Marketer")) return badRequest("Your workspace role cannot approve campaigns");
    if (!campaign.activeVersionId) return badRequest("Create a campaign version before approving");
    const version = await prisma.campaignVersion.findFirst({ where: { id: campaign.activeVersionId, campaignId: id } });
    if (!version) return badRequest("Active campaign version not found");
    const approvalExpiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
    const approvalHash = computeCampaignApprovalHash(id, version.id, version.contentHash);
    const updated = await prisma.campaign.update({ where: { id }, data: { approvalHash, approvalExpiresAt } });
    await writeAudit(user.id, "campaign.approved", "Campaign", id, { versionId: version.id }, workspace.id);
    return ok({ campaign: { id: updated.id, activeVersionId: updated.activeVersionId, approvalExpiresAt: updated.approvalExpiresAt?.toISOString() ?? null } });
  } catch (error) { return handleError(error); }
}
