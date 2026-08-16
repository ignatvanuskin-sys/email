import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";
import { analyzeLead, getActiveAiClient } from "@/lib/ai";
import { computeScore } from "@/lib/leadScore";
import { rateLimit } from "@/lib/rateLimit";

const schema = z.object({ leadId: z.string().min(1) });

export async function POST(req: Request) {
  const limited = rateLimit(req, "ai-analyze", 20, 60 * 1000);
  if (limited) return limited;
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const body = await readJson(req);
    const { leadId } = schema.parse(body);

    const lead = await prisma.lead.findFirst({ where: { id: leadId, userId: user.id } });
    if (!lead) return notFound("Lead not found");

    const client = await getActiveAiClient(user.id).catch((err) => {
      throw new Error(err instanceof Error ? err.message : "AI provider not connected");
    });

    const result = await analyzeLead(client, {
      name: lead.name,
      companyOrChannel: lead.companyOrChannel,
      niche: lead.niche,
      youtubeUrl: lead.youtubeUrl,
      followersCount: lead.followersCount,
      businessDescription: user.businessDescription,
    });

    const { score, breakdown } = computeScore({
      email: lead.email,
      followersCount: lead.followersCount,
      contentActivity: result.contentActivity,
      longFormCount: result.longFormCount || lead.longFormCount,
      shortFormCount: result.shortFormCount || lead.shortFormCount || 0,
      growthSignal: result.growthSignal,
      commercialPotential: result.commercialPotential,
    });

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        insight: JSON.stringify(result),
        contentActivity: result.contentActivity,
        longFormCount: result.longFormCount,
        shortFormCount: result.shortFormCount,
        growthSignal: result.growthSignal,
        commercialPotential: result.commercialPotential,
        leadScore: score,
        scoreBreakdown: JSON.stringify(breakdown),
        status: lead.status === "New" ? "Analyzed" : lead.status,
      },
    });

    await prisma.activity.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        type: "Analyzed",
        payload: JSON.stringify({ score }),
      },
    });

    return ok({ result: { ...result, score, breakdown, status: updated.status } });
  } catch (err) {
    if (err instanceof Error && err.message === "AI provider not connected") {
      return badRequest(err.message);
    }
    return handleError(err);
  }
}