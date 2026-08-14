import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
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

    let leadIds: string[] = [];
    if (campaign.segmentId) {
      const segment = await prisma.segment.findFirst({ where: { id: campaign.segmentId, userId: user.id } });
      if (!segment) return badRequest("Linked segment not found");
      const leads = await prisma.lead.findMany({ where: { userId: user.id }, select: { id: true } });
      leadIds = leads.map((l) => l.id);
    } else {
      const leads = await prisma.lead.findMany({ where: { userId: user.id }, select: { id: true } });
      leadIds = leads.map((l) => l.id);
    }

    for (const leadId of leadIds) {
      await prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId: id, leadId } },
        create: { campaignId: id, leadId, status: CAMPAIGN_LEAD_STATUS.PENDING },
        update: {},
      });
    }

    await prisma.campaign.update({ where: { id }, data: { status: CAMPAIGN_STATUS.RUNNING, startedAt: new Date() } });
    await prisma.activity.create({
      data: { userId: user.id, type: "CampaignStarted", payload: JSON.stringify({ campaignId: id, name: campaign.name, leads: leadIds.length }) },
    });

    return ok({ campaignId: id, status: CAMPAIGN_STATUS.RUNNING, leads: leadIds.length });
  } catch (err) {
    return handleError(err);
  }
}