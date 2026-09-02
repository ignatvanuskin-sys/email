import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, unauthorized, badRequest } from "@/lib/api";

const leadSelect = { id: true, name: true, companyOrChannel: true, email: true } as const;
type Cursor = { dueDate: Date; id: string };
type FollowUpRow = {
  id: string;
  dueDate: Date;
  status: string;
  note: string;
  lead: { id: string; name: string; companyOrChannel: string; email: string | null };
};

type Page = {
  rows: FollowUpRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorValues = {
      dueToday: url.searchParams.get("cursorDueToday"),
      upcoming: url.searchParams.get("cursorUpcoming"),
      completed: url.searchParams.get("cursorCompleted"),
    };
    const cursors = {
      dueToday: parseCursor(cursorValues.dueToday),
      upcoming: parseCursor(cursorValues.upcoming),
      completed: parseCursor(cursorValues.completed),
    };
    if ((cursorValues.dueToday && !cursors.dueToday) || (cursorValues.upcoming && !cursors.upcoming) || (cursorValues.completed && !cursors.completed)) {
      return badRequest("Invalid cursor");
    }

    const today = startOfDay();
    const endToday = endOfToday();
    const upcomingEnd = new Date(today.getTime() + 6 * 86400000);
    const [dueToday, upcoming, completed, pendingCount] = await Promise.all([
      page({ userId: user.id, status: "Pending", dueDate: { lt: endToday } }, cursors.dueToday, limit),
      page({ userId: user.id, status: "Pending", dueDate: { gte: endToday, lte: upcomingEnd } }, cursors.upcoming, limit),
      page({ userId: user.id, status: { in: ["Completed", "Skipped", "Cancelled"] } }, cursors.completed, limit),
      prisma.followUp.count({ where: { userId: user.id, status: "Pending" } }),
    ]);

    return ok({
      groups: {
        dueToday: render(dueToday.rows),
        upcoming: render(upcoming.rows),
        completed: render(completed.rows),
        pendingCount,
        nextCursors: { dueToday: dueToday.nextCursor, upcoming: upcoming.nextCursor, completed: completed.nextCursor },
        hasMore: { dueToday: dueToday.hasMore, upcoming: upcoming.hasMore, completed: completed.hasMore },
      },
    });

    function render(list: typeof dueToday.rows) {
      return list.map((f) => ({
        id: f.id,
        dueDate: f.dueDate.toISOString(),
        status: f.status,
        note: f.note,
        overdue: f.dueDate.getTime() < today.getTime(),
        lead: f.lead,
      }));
    }
  } catch (err) {
    return handleError(err);
  }
}

async function page(where: Prisma.FollowUpWhereInput, cursor: Cursor | null, limit: number): Promise<Page> {
  const rows = await prisma.followUp.findMany({
    where: {
      AND: [where, ...(cursor ? [{ OR: [
        { dueDate: { gt: cursor.dueDate } },
        { dueDate: cursor.dueDate, id: { gt: cursor.id } },
      ] }] : [])],
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take: limit + 1,
    include: { lead: { select: leadSelect } },
  });
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible.at(-1);
  return {
    rows: visible,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ dueDate: last.dueDate.toISOString(), id: last.id }) : null,
  };
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}

function encodeCursor(cursor: { dueDate: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { dueDate?: unknown; id?: unknown };
    if (typeof parsed.dueDate !== "string" || typeof parsed.id !== "string" || !parsed.id) return null;
    const dueDate = new Date(parsed.dueDate);
    return Number.isNaN(dueDate.getTime()) ? null : { dueDate, id: parsed.id };
  } catch {
    return null;
  }
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
