import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { CAMPAIGN_STATUS, CAMPAIGN_LEAD_STATUS } from "@/lib/status";
import { runCampaignPreflight } from "@/lib/campaignPreflight";
import { createCampaignVersion } from "@/lib/campaignVersions";
import { isCampaignApprovalValid } from "@/lib/approval";
import { assignVariant } from "@/lib/campaignExperiments";
import { ensureWorkspace, roleCan, writeAudit } from "@/lib/workspace";
import { parseSegmentFilters, segmentLeadWhere } from "@/lib/segmentFilters";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const workspace = await ensureWorkspace(user);
    const membership = workspace.memberships.find((item) => item.userId === user.id);
    if (!membership || !roleCan(membership.role, "Marketer")) return badRequest("Your workspace role cannot start campaigns");
    if (campaign.status !== "Draft" && campaign.status !== "Paused") {
      return badRequest("Campaign must be in Draft or Paused status to start");
    }

    const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true } });
    if (!provider) return badRequest("Email provider not configured");

    const preflight = await runCampaignPreflight(user.id, id, false);
    if (!preflight) return notFound("Campaign not found");
    if (!preflight.ready) {
      return badRequest(`Campaign preflight failed: ${preflight.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join("; ")}`);
    }

    let activeVersionId = campaign.activeVersionId;
    if (!activeVersionId) {
      const createdVersion = await createCampaignVersion(user.id, id);
      if (!createdVersion) return notFound("Campaign not found");
      activeVersionId = createdVersion.id;
      await prisma.campaign.update({ where: { id }, data: { activeVersionId, approvalHash: null, approvalExpiresAt: null } });
      return badRequest("Campaign version created. Approve this exact version before starting.");
    }
    const version = await prisma.campaignVersion.findFirst({ where: { id: activeVersionId, campaignId: id } });
    if (!version || !isCampaignApprovalValid(id, version.id, version.contentHash, campaign.approvalHash, campaign.approvalExpiresAt)) {
      return badRequest("Approve the current campaign version before starting.");
    }

    const variants = await prisma.campaignVariant.findMany({ where: { campaignId: id }, select: { id: true, weight: true } });
    let leadIds: string[] = [];
    if (campaign.segmentId) {
      const segment = await prisma.segment.findFirst({ where: { id: campaign.segmentId, userId: user.id } });
      if (!segment) return badRequest("Linked segment not found");
       const leads = await prisma.lead.findMany({ where: segmentLeadWhere(user.id, parseSegmentFilters(segment.filters)), select: { id: true } });
      leadIds = leads.map((l) => l.id);
    } else {
      const leads = await prisma.lead.findMany({ where: { userId: user.id }, select: { id: true } });
      leadIds = leads.map((l) => l.id);
    }

    for (const leadId of leadIds) {
      await prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId: id, leadId } },
        create: { campaignId: id, leadId, status: CAMPAIGN_LEAD_STATUS.PENDING, assignedVariantId: assignVariant(`${id}:${leadId}`, variants) },
        update: {},
      });
    }

    await prisma.campaign.update({ where: { id }, data: { status: CAMPAIGN_STATUS.RUNNING, startedAt: new Date() } });
    await prisma.activity.create({
      data: { userId: user.id, type: "CampaignStarted", payload: JSON.stringify({ campaignId: id, name: campaign.name, leads: leadIds.length }) },
    });
    await writeAudit(user.id, "campaign.started", "Campaign", id, { leads: leadIds.length }, workspace.id);

    return ok({ campaignId: id, status: CAMPAIGN_STATUS.RUNNING, leads: leadIds.length });
  } catch (err) {
    return handleError(err);
  }
}
