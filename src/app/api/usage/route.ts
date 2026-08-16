import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { usageSnapshot } from "@/lib/usage";

export async function GET() { try { const user = await getApiUser(); if (!user) return unauthorized(); return ok({ usage: await usageSnapshot(user.id) }); } catch (error) { return handleError(error); } }
