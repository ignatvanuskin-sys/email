import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized, apiError } from "@/lib/api";
import { getSubscription, PLAN_CATALOG } from "@/lib/billing";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    return ok({ subscription: await getSubscription(user.id), plans: PLAN_CATALOG });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const data = z.object({ plan: z.enum(["Free", "Pro", "Agency"]) }).parse(await readJson(req));
    if (data.plan !== "Free") {
      return apiError("Paid plans require checkout and verified payment", 402, "BILLING_CHECKOUT_REQUIRED");
    }
    const subscription = await getSubscription(user.id);
    if (subscription.plan !== "Free") {
      return apiError("Use the billing portal to cancel a paid subscription", 409, "BILLING_PORTAL_REQUIRED");
    }
    return ok({ subscription });
  } catch (error) {
    return handleError(error);
  }
}
