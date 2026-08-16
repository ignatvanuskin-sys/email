import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { aggregateCohorts } from "@/lib/cohortAnalytics";

export async function GET() {
  try { const user = await getApiUser(); if (!user) return unauthorized(); return ok({ cohorts: await aggregateCohorts(user.id) }); } catch (error) { return handleError(error); }
}
