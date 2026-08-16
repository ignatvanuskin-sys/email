import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const result = await prisma.sendingDomain.deleteMany({ where: { id, userId: user.id } });
    if (!result.count) return notFound("Sending domain not found");
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
