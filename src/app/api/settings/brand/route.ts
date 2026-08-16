import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const schema = z.object({ businessDescription: z.string().trim().max(2000).optional(), brandTone: z.string().trim().max(500).optional(), brandAudience: z.string().trim().max(1000).optional(), brandOffer: z.string().trim().max(1000).optional(), brandForbidden: z.string().trim().max(1000).optional() });

export async function PATCH(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const data = schema.parse(await readJson(req));
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return ok({ brand: { businessDescription: updated.businessDescription, brandTone: updated.brandTone, brandAudience: updated.brandAudience, brandOffer: updated.brandOffer, brandForbidden: updated.brandForbidden } });
  } catch (error) { return handleError(error); }
}
