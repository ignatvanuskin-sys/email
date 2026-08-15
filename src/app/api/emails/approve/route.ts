import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { emailApproveSchema } from "@/lib/validation";
import { computeApprovalHash, APPROVAL_TTL_MS } from "@/lib/approval";
import { ensureUnsubscribeFooter } from "@/lib/unsubscribe";

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = emailApproveSchema.parse(body);

    const email = await prisma.emailMessage.findFirst({ where: { id: d.emailId, userId: user.id } });
    if (!email) return notFound("Email not found");
    if (email.status === "Sent" || email.status === "Sending") return badRequest("This email has already been sent");

    const lead = await prisma.lead.findFirst({ where: { id: email.leadId, userId: user.id }, select: { id: true, email: true } });
    if (!lead?.email) return badRequest("This lead has no email address");

    const subject = d.subject.trim();
    const bodyText = ensureUnsubscribeFooter(d.body, process.env.APP_URL ?? "http://localhost:3000", user.id, lead.id, lead.email);
    const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
    const approvalHash = computeApprovalHash(email.id, subject, bodyText);

    const updated = await prisma.emailMessage.update({
      where: { id: email.id },
      data: { subject, body: bodyText, approvalHash, approvalExpiresAt: expiresAt },
    });

    await prisma.activity.create({
      data: { userId: user.id, leadId: email.leadId, type: "EmailApproved", payload: JSON.stringify({ emailId: email.id }) },
    });

    return ok({
      email: {
        id: updated.id,
        subject: updated.subject,
        body: updated.body,
        status: updated.status,
        approvalExpiresAt: updated.approvalExpiresAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
