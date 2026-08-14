import { getApiUser, ok, unauthorized } from "@/lib/api";
import { discoverOpenRouterModels, filterOpenRouterModels } from "@/lib/openrouter";

export async function GET(req: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  const freeOnly = new URL(req.url).searchParams.get("freeOnly") === "true";
  const result = await discoverOpenRouterModels();
  return ok({ models: filterOpenRouterModels(result.models, freeOnly), fallback: result.fallback });
}
