import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

export const WORKSPACE_ROLES = ["Owner", "Admin", "Marketer", "Analyst", "Designer", "Viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const ROLE_RANK: Record<WorkspaceRole, number> = { Viewer: 10, Analyst: 20, Designer: 30, Marketer: 40, Admin: 80, Owner: 100 };

export function roleCan(role: string, minimum: WorkspaceRole): boolean {
  return (ROLE_RANK[role as WorkspaceRole] ?? 0) >= ROLE_RANK[minimum];
}

export async function ensureWorkspace(user: User) {
  const existing = await prisma.workspace.findFirst({ where: { ownerId: user.id }, include: { memberships: true } });
  if (existing) return existing;
  return prisma.workspace.create({ data: { ownerId: user.id, name: `${user.name || user.email} workspace`, slug: `${user.id}-${randomBytes(3).toString("hex")}`, memberships: { create: { userId: user.id, role: "Owner" } } }, include: { memberships: true } });
}

export async function getMembership(userId: string, workspaceId?: string) {
  if (workspaceId) return prisma.workspaceMembership.findFirst({ where: { workspaceId, userId } });
  return prisma.workspaceMembership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export function hashInvitationToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }

export async function writeAudit(userId: string, action: string, resource: string, resourceId?: string, metadata: unknown = {}, workspaceId?: string) {
  return prisma.auditLog.create({ data: { userId, workspaceId: workspaceId ?? null, action, resource, resourceId: resourceId ?? null, metadata: JSON.stringify(metadata) } });
}
