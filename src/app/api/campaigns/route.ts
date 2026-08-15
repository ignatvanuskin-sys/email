import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { validateCampaignReferences } from "@/lib/ownership";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional().default(""),
  dailyLimit: z.number().int().positive().optional().default(25),
  templateId: z.string().optional().nullable().default(null),
  sequenceId: z.string().optional().nullable().default(null),
  segmentId: z.string().optional().nullable().default(null),
});

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const campaigns = await prisma.campaign.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { leads: true, variants: true } },
      },
    });
    return ok({ campaigns });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = createSchema.parse(body);
    await validateCampaignReferences(user.id, d);
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name: d.name,
        description: d.description,
        dailyLimit: d.dailyLimit,
        templateId: d.templateId,
        sequenceId: d.sequenceId,
        segmentId: d.segmentId,
      },
    });
    await prisma.activity.create({
      data: { userId: user.id, type: "CampaignCreated", payload: JSON.stringify({ campaignId: campaign.id, name: campaign.name }) },
    });
    return ok({ campaign }, 201);
  } catch (err) {
    return handleError(err);
  }
}