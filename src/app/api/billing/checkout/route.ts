import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { getSubscription, PLAN_CATALOG } from "@/lib/billing";
import { env } from "@/lib/env";

export async function POST(req: Request) { try { const user = await getApiUser(); if (!user) return unauthorized(); const data = z.object({ plan: z.enum(["Pro", "Agency"]) }).parse(await readJson(req)); const subscription = await getSubscription(user.id); const plan = PLAN_CATALOG.find((item) => item.id === data.plan)!; const checkoutUrl = process.env.STRIPE_CHECKOUT_URL_TEMPLATE ? process.env.STRIPE_CHECKOUT_URL_TEMPLATE.replace("{PLAN}", plan.id).replace("{USER}", user.id) : `${env.APP_URL}/settings?billing=configure&plan=${plan.id}`; return ok({ checkoutUrl, plan: plan.id, customerId: subscription.stripeCustomerId }); } catch (error) { return handleError(error); } }
