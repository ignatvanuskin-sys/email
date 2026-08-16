import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ versionId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const data = schema.parse(await readJson(req));
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const version = await prisma.campaignVersion.findFirst({ where: { id: data.versionId, campaignId: id } });
    if (!version) return badRequest("Version does not belong to this campaign");
    await prisma.campaign.update({ where: { id }, data: { activeVersionId: version.id, approvalHash: null, approvalExpiresAt: null } });
    return ok({ activeVersionId: version.id });
  } catch (error) { return handleError(error); }
}
