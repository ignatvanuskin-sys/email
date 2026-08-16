import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { getOnboardingProgress } from "@/lib/onboarding";

export async function GET() { try { const user = await getApiUser(); if (!user) return unauthorized(); return ok({ onboarding: await getOnboardingProgress(user.id) }); } catch (error) { return handleError(error); } }
