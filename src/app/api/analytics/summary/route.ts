import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { aggregateAnalyticsSummary } from "@/lib/analyticsSummary";

export async function GET() { try { const user = await getApiUser(); if (!user) return unauthorized(); return ok({ analytics: await aggregateAnalyticsSummary(user.id) }); } catch (error) { return handleError(error); } }
