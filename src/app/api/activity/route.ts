import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const url = new URL(req.url); const since = url.searchParams.get("since"); const limit = Math.min(Number(url.searchParams.get("limit") ?? 30) || 30, 100); const activities = await prisma.activity.findMany({ where: { userId: user.id, ...(since ? { createdAt: { gt: new Date(since) } } : {}) }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, type: true, payload: true, createdAt: true, lead: { select: { id: true, name: true } } } }); return ok({ activities: activities.map((activity) => ({ ...activity, payload: safeJson(activity.payload), createdAt: activity.createdAt.toISOString() })), cursor: activities[0]?.createdAt.toISOString() ?? since ?? null }); } catch (error) { return handleError(error); }
}

function safeJson(value: string) { try { return JSON.parse(value || "{}"); } catch { return {}; } }
