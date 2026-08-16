import { getApiUser, handleError, notFound, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!lead) return notFound("Lead not found");
    const enrollments = await prisma.journeyEnrollment.findMany({
      where: { userId: user.id, leadId: id },
      orderBy: { updatedAt: "desc" },
      include: {
        sequence: { select: { id: true, name: true, triggerType: true, channel: true, goalEventType: true, exitEventType: true } },
      },
    });
    return ok({
      enrollments: enrollments.map((enrollment) => ({
        id: enrollment.id,
        sequence: enrollment.sequence,
        status: enrollment.status,
        currentStep: enrollment.currentStep,
        nextRunAt: enrollment.nextRunAt?.toISOString() ?? null,
        lastError: enrollment.lastError,
        context: JSON.parse(enrollment.contextJson || "{}"),
        createdAt: enrollment.createdAt.toISOString(),
        updatedAt: enrollment.updatedAt.toISOString(),
      })),
    });
  } catch (error) { return handleError(error); }
}
