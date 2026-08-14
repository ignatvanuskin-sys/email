import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { pauseSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    return ok({ paused: user.outreachPaused });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = pauseSchema.parse(body);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { outreachPaused: d.paused } });
    return ok({ paused: updated.outreachPaused });
  } catch (err) {
    return handleError(err);
  }
}