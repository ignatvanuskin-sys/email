import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { compileSegmentWhere, validateCampaignReferences } from "@/lib/ownership";
import { CAMPAIGN_STATUS, CAMPAIGN_LEAD_STATUS } from "@/lib/status";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    if (campaign.status !== "Draft" && campaign.status !== "Paused") {
      return badRequest("Campaign must be in Draft or Paused status to start");
    }

    const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true } });
    if (!provider) return badRequest("Email provider not configured");
    await validateCampaignReferences(user.id, campaign);

    const leadWhere = campaign.segmentId
      ? await compileSegmentWhere(user.id, campaign.segmentId)
      : { userId: user.id };
    const leads = await prisma.lead.findMany({ where: leadWhere, select: { id: true } });
    const leadIds = leads.map((lead) => lead.id);
    if (leadIds.length === 0) return badRequest("The selected segment contains no leads");

    await prisma.$transaction([
      ...leadIds.map((leadId) => prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId: id, leadId } },
        create: { campaignId: id, leadId, status: CAMPAIGN_LEAD_STATUS.PENDING },
        update: { status: CAMPAIGN_LEAD_STATUS.PENDING },
      })),
      prisma.campaign.update({ where: { id }, data: { status: CAMPAIGN_STATUS.RUNNING, startedAt: new Date() } }),
      prisma.activity.create({
        data: { userId: user.id, type: "CampaignStarted", payload: JSON.stringify({ campaignId: id, name: campaign.name, leads: leadIds.length }) },
      }),
    ]);

    return ok({ campaignId: id, status: CAMPAIGN_STATUS.RUNNING, leads: leadIds.length });
  } catch (err) {
    return handleError(err);
  }
}
