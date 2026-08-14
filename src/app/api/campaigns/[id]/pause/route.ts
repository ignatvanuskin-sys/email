import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized, badRequest } from "@/lib/api";
import { CAMPAIGN_STATUS } from "@/lib/status";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    if (campaign.status !== "Running") return badRequest("Only running campaigns can be paused");
    await prisma.campaign.update({ where: { id }, data: { status: CAMPAIGN_STATUS.PAUSED } });
    await prisma.activity.create({
      data: { userId: user.id, type: "CampaignPaused", payload: JSON.stringify({ campaignId: id }) },
    });
    return ok({ campaignId: id, status: CAMPAIGN_STATUS.PAUSED });
  } catch (err) {
    return handleError(err);
  }
}