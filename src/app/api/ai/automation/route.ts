import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { getActiveAiClient } from "@/lib/ai";
import { generateAutomation } from "@/lib/aiAutomation";
import { requestRateLimit } from "@/lib/rateLimit";

const schema = z.object({ description: z.string().trim().min(5).max(2000) });
export async function POST(req: Request) { const limited = await requestRateLimit(req, "ai-automation", 20, 60 * 1000); if (limited) return limited; try { const user = await getApiUser(); if (!user) return unauthorized(); const data = schema.parse(await readJson(req)); return ok({ automation: await generateAutomation(await getActiveAiClient(user.id), data.description) }); } catch (error) { return handleError(error); } }
