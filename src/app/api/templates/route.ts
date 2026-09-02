import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().trim().max(100).optional().default("Custom"),
  subject: z.string().trim().min(1, "Subject is required").max(500),
  body: z.string().trim().min(1, "Body is required").max(50000),
  documentJson: z.string().max(200000).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    if (cursorValue && !cursor) return badRequest("Invalid cursor");
    const rows = await prisma.emailTemplate.findMany({
      where: {
        userId: user.id,
        ...(cursor ? { OR: [
          { updatedAt: { lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
        ] } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const templates = hasMore ? rows.slice(0, limit) : rows;
    const last = templates.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : null;
    return ok({ templates, nextCursor, hasMore });
  } catch (err) {
    return handleError(err);
  }
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}

function encodeCursor(cursor: { updatedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): { updatedAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { updatedAt?: unknown; id?: unknown };
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string" || !parsed.id) return null;
    const updatedAt = new Date(parsed.updatedAt);
    return Number.isNaN(updatedAt.getTime()) ? null : { updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = createSchema.parse(body);
    const template = await prisma.emailTemplate.create({
      data: { userId: user.id, name: d.name, category: d.category, subject: d.subject, body: d.body, documentJson: d.documentJson ?? null },
    });
    return ok({ template }, 201);
  } catch (err) {
    return handleError(err);
  }
}
