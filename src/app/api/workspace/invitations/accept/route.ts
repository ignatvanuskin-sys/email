import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { hashInvitationToken, writeAudit } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

const schema = z.object({ token: z.string().min(20) });

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { token } = schema.parse(await readJson(req));
    const invitation = await prisma.workspaceInvitation.findUnique({ where: { tokenHash: hashInvitationToken(token) } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return badRequest("Invitation is invalid or expired");
    if (invitation.email !== user.email.toLowerCase()) return badRequest("Invitation email does not match the signed-in account");
    await prisma.$transaction([
      prisma.workspaceMembership.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } }, create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role }, update: { role: invitation.role } }),
      prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
    ]);
    await writeAudit(user.id, "workspace.invite_accepted", "WorkspaceInvitation", invitation.id, {}, invitation.workspaceId);
    return ok({ workspaceId: invitation.workspaceId, role: invitation.role });
  } catch (error) { return handleError(error); }
}
