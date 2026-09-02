import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { validateCampaignReferences } from "@/lib/ownership";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().max(2000).optional().default(""),
  dailyLimit: z.number().int().positive().optional().default(25),
  templateId: z.string().optional().nullable().default(null),
  sequenceId: z.string().optional().nullable().default(null),
  segmentId: z.string().optional().nullable().default(null),
  frequencyCap: z.number().int().min(1).max(100).optional().nullable().default(null),
  frequencyWindowDays: z.number().int().min(1).max(90).optional().nullable().default(null),
  sendTimeOptimization: z.boolean().optional().default(false),
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
    const rows = await prisma.campaign.findMany({
      where: {
        userId: user.id,
        ...(cursor ? { OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { _count: { select: { leads: true, variants: true } } },
    });
    const hasMore = rows.length > limit;
    const campaigns = hasMore ? rows.slice(0, limit) : rows;
    const last = campaigns.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return ok({ campaigns, nextCursor, hasMore });
  } catch (err) {
    return handleError(err);
  }
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}

function encodeCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): { createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || !parsed.id) return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: parsed.id };
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
    await validateCampaignReferences(user.id, d);
    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name: d.name,
        description: d.description,
        dailyLimit: d.dailyLimit,
        templateId: d.templateId,
        sequenceId: d.sequenceId,
        segmentId: d.segmentId,
        frequencyCap: d.frequencyCap,
        frequencyWindowDays: d.frequencyWindowDays,
        sendTimeOptimization: d.sendTimeOptimization,
      },
    });
    await prisma.activity.create({
      data: { userId: user.id, type: "CampaignCreated", payload: JSON.stringify({ campaignId: campaign.id, name: campaign.name }) },
    });
    return ok({ campaign }, 201);
  } catch (err) {
    return handleError(err);
  }
}
