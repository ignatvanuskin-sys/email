import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { getActiveAiClient, chat } from "@/lib/ai";
import { aggregateCampaignAnalytics } from "@/lib/campaignAnalytics";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const analytics = await aggregateCampaignAnalytics(user.id, id);
    if (!analytics) return notFound("Campaign not found");
    const client = await getActiveAiClient(user.id);
    const text = await chat(client, "You are an email campaign analyst. Return ONLY strict JSON: {\"summary\":string,\"recommendations\":string[]}. Use only supplied metrics. Do not invent causes.", JSON.stringify(analytics));
    let insights: { summary: string; recommendations: string[] };
    try { insights = JSON.parse(text) as { summary: string; recommendations: string[] }; } catch { insights = { summary: "Campaign metrics are ready for review.", recommendations: ["Compare clicks and replies by audience before changing content."] }; }
    return ok({ insights, analytics });
  } catch (error) { return handleError(error); }
}
