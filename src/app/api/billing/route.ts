import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { getSubscription, PLAN_CATALOG, setPlan } from "@/lib/billing";

export async function GET() { try { const user = await getApiUser(); if (!user) return unauthorized(); return ok({ subscription: await getSubscription(user.id), plans: PLAN_CATALOG }); } catch (error) { return handleError(error); } }
export async function PATCH(req: Request) { try { const user = await getApiUser(); if (!user) return unauthorized(); const data = z.object({ plan: z.enum(["Free", "Pro", "Agency"]) }).parse(await readJson(req)); return ok({ subscription: await setPlan(user.id, data.plan) }); } catch (error) { return handleError(error); } }
