import { z } from "zod";
import { getActiveAiClient } from "@/lib/ai";
import { generateCampaignDraft } from "@/lib/campaignAi";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";

const schema = z.object({ goal: z.string().trim().min(3).max(2000), audience: z.string().trim().max(1000).default(""), offer: z.string().trim().max(1000).default(""), tone: z.string().trim().max(300).default("warm and concise") });

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const data = schema.parse(await readJson(req));
    const draft = await generateCampaignDraft(await getActiveAiClient(user.id), { ...data, brand: { businessDescription: user.businessDescription, tone: user.brandTone, audience: user.brandAudience, offer: user.brandOffer, forbidden: user.brandForbidden } });
    return ok({ draft });
  } catch (error) { return handleError(error); }
}
