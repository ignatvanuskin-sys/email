import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();

    const today = startOfDay();
    const followUps = await prisma.followUp.findMany({
      where: { userId: user.id },
      orderBy: { dueDate: "asc" },
      include: { lead: { select: { id: true, name: true, companyOrChannel: true, email: true } } },
    });

    const dt = (d: Date) => d.getTime();
    const dueToday = followUps.filter(
      (f) => f.status === "Pending" && dt(f.dueDate) < endOfToday().getTime(),
    );
    const upcoming = followUps.filter(
      (f) => f.status === "Pending" && dt(f.dueDate) >= endOfToday().getTime() && dt(f.dueDate) <= dt(today) + 6 * 86400000,
    );
    const completed = followUps.filter(
      (f) => f.status === "Completed" || f.status === "Skipped" || f.status === "Cancelled",
    );

    return ok({
      groups: {
        dueToday: render(dueToday),
        upcoming: render(upcoming),
        completed: render(completed),
        pendingCount: followUps.filter((f) => f.status === "Pending").length,
      },
    });

    function render(list: typeof followUps) {
      return list.map((f) => ({
        id: f.id,
        dueDate: f.dueDate.toISOString(),
        status: f.status,
        note: f.note,
        overdue: dt(f.dueDate) < today.getTime(),
        lead: f.lead,
      }));
    }
  } catch (err) {
    return handleError(err);
  }
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}