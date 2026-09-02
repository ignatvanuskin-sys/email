import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { hashInvitationToken, ensureWorkspace, roleCan, WORKSPACE_ROLES, writeAudit } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

const schema = z.object({ email: z.string().email(), role: z.enum(WORKSPACE_ROLES).default("Viewer") });

export async function GET() {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); const members = await prisma.workspaceMembership.findMany({ where: { workspaceId: workspace.id }, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: "asc" } }); return ok({ members: members.map((member) => ({ id: member.id, role: member.role, user: member.user, createdAt: member.createdAt.toISOString() })) }); } catch (error) { return handleError(error); }
}

export async function POST(req: Request) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !roleCan(membership.role, "Admin")) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }); const data = schema.parse(await readJson(req)); const token = randomBytes(32).toString("base64url"); const invitation = await prisma.workspaceInvitation.create({ data: { workspaceId: workspace.id, email: data.email.toLowerCase(), role: data.role, tokenHash: hashInvitationToken(token), invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } }); await writeAudit(user.id, "workspace.invite_created", "WorkspaceInvitation", invitation.id, { email: data.email, role: data.role }, workspace.id); return ok({ invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt.toISOString() } }, 201); } catch (error) { return handleError(error); }
}
