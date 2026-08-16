import { z } from "zod";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { ensureWorkspace, roleCan, WORKSPACE_ROLES, writeAudit } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

const schema = z.object({ role: z.enum(WORKSPACE_ROLES) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); const actor = workspace.memberships.find((item) => item.userId === user.id); if (!actor || !roleCan(actor.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }); const { id } = await params; const membership = await prisma.workspaceMembership.findFirst({ where: { id, workspaceId: workspace.id } }); if (!membership) return notFound("Member not found"); const data = schema.parse(await readJson(req)); if (membership.role === "Owner" || (data.role === "Owner" && actor.role !== "Owner")) return badRequest("Only the owner can change owner membership"); const updated = await prisma.workspaceMembership.update({ where: { id }, data: { role: data.role } }); await writeAudit(user.id, "workspace.member_role_changed", "WorkspaceMembership", id, { role: data.role }, workspace.id); return ok({ member: { id: updated.id, role: updated.role } }); } catch (error) { return handleError(error); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); const actor = workspace.memberships.find((item) => item.userId === user.id); if (!actor || !roleCan(actor.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }); const { id } = await params; const membership = await prisma.workspaceMembership.findFirst({ where: { id, workspaceId: workspace.id } }); if (!membership) return notFound("Member not found"); if (membership.role === "Owner") return badRequest("Owner membership cannot be removed"); await prisma.workspaceMembership.delete({ where: { id } }); await writeAudit(user.id, "workspace.member_removed", "WorkspaceMembership", id, {}, workspace.id); return ok({ deleted: true }); } catch (error) { return handleError(error); }
}
