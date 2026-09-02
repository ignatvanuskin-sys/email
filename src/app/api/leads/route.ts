import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { leadCreateSchema } from "@/lib/validation";
import { mapLead } from "@/lib/serialize";

export async function GET(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const tier = url.searchParams.get("tier"); // HOT | WARM | COLD
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    if (cursorValue && !cursor) return badRequest("Invalid cursor");

    const filters: Record<string, unknown>[] = [{ userId: user.id }];
    if (status) filters.push({ status });
    if (q) {
      filters.push({ OR: [
        { name: { contains: q } },
        { companyOrChannel: { contains: q } },
        { email: { contains: q } },
        { niche: { contains: q } },
      ] });
    }
    if (tier === "HOT") filters.push({ leadScore: { gte: 80 } });
    else if (tier === "WARM") filters.push({ leadScore: { gte: 50, lt: 80 } });
    else if (tier === "COLD") filters.push({ leadScore: { lt: 50 } });
    if (cursor) {
      filters.push({ OR: [
        { leadScore: { lt: cursor.leadScore } },
        { leadScore: cursor.leadScore, createdAt: { lt: cursor.createdAt } },
        { leadScore: cursor.leadScore, createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ] });
    }

    const rows = await prisma.lead.findMany({
      where: { AND: filters },
      orderBy: [{ leadScore: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        _count: { select: { emails: true, replies: true, followUps: true } },
      },
    });
    const hasMore = rows.length > limit;
    const leads = hasMore ? rows.slice(0, limit) : rows;
    const last = leads.at(-1);
    const nextCursor = hasMore && last ? encodeCursor({ leadScore: last.leadScore, createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return ok({ leads: leads.map(mapLead), nextCursor, hasMore });
  } catch (err) {
    return handleError(err);
  }
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 50;
}

function encodeCursor(cursor: { leadScore: number; createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): { leadScore: number; createdAt: Date; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { leadScore?: unknown; createdAt?: unknown; id?: unknown };
    if (typeof parsed.leadScore !== "number" || !Number.isInteger(parsed.leadScore) || typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || !parsed.id) return null;
    return { leadScore: parsed.leadScore, createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = leadCreateSchema.parse(body);

    const email = d.email?.toLowerCase().trim() || null;
    if (email) {
      const dup = await prisma.lead.findUnique({
        where: { userId_email: { userId: user.id, email } },
      });
      if (dup) {
        return NextResponse.json(
          { error: `A lead with email ${email} already exists` },
          { status: 409 },
        );
      }
    }

    const lead = await prisma.lead.create({
      data: {
        userId: user.id,
        name: d.name,
        companyOrChannel: d.companyOrChannel,
        email,
        websiteUrl: d.websiteUrl,
        youtubeUrl: d.youtubeUrl,
        instagramUrl: d.instagramUrl,
        telegramUrl: d.telegramUrl,
        niche: d.niche,
        followersCount: d.followersCount,
        contentActivity: d.contentActivity,
        longFormCount: d.longFormCount,
        shortFormCount: d.shortFormCount,
        growthSignal: d.growthSignal,
        commercialPotential: d.commercialPotential,
        status: "New",
      },
    });

    await prisma.activity.create({
      data: { userId: user.id, leadId: lead.id, type: "LeadCreated", payload: JSON.stringify({}) },
    });

    return ok({ lead: mapLead(lead) }, 201);
  } catch (err) {
    return handleError(err);
  }
}