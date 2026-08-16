import { getApiUser, handleError, ok, unauthorized } from "@/lib/api";
import { ensureWorkspace, roleCan } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !roleCan(membership.role, "Analyst")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }); const logs = await prisma.auditLog.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 100 }); return ok({ logs: logs.map((log) => ({ ...log, metadata: JSON.parse(log.metadata || "{}"), createdAt: log.createdAt.toISOString() })) }); } catch (error) { return handleError(error); }
}
