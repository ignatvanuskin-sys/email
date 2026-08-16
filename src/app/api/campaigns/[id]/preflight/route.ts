import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { runCampaignPreflight } from "@/lib/campaignPreflight";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const result = await runCampaignPreflight(user.id, id, true);
    if (!result) return notFound("Campaign not found");
    return ok({ preflight: result });
  } catch (error) {
    return handleError(error);
  }
}
