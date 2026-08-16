import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { emailEditActionSchema } from "@/lib/validation";
import { editEmail, getActiveAiClient } from "@/lib/ai";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "ai-edit", 20, 60 * 1000);
  if (limited) return limited;
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const d = emailEditActionSchema.parse(body);
    const emailId = typeof body === "object" && body && typeof (body as { emailId?: unknown }).emailId === "string"
      ? (body as { emailId: string }).emailId
      : null;
    if (!emailId) return badRequest("emailId is required");

    const email = await prisma.emailMessage.findFirst({ where: { id: emailId, userId: user.id } });
    if (!email) return notFound("Email not found");
    if (email.status === "Sent") return badRequest("A sent email cannot be edited");

    const client = await getActiveAiClient(user.id);
    console.info("[email-edit] request", { action: d.action, emailId: email.id, currentBodyLength: email.body.length });
    const lead = await prisma.lead.findFirst({ where: { id: email.leadId, userId: user.id }, select: { name: true, companyOrChannel: true, niche: true, youtubeUrl: true } });
    const edited = await editEmail(client, d.action, { subject: email.subject, body: email.body }, lead ?? undefined);
    console.info("[email-edit] result", { action: d.action, emailId: email.id, generatedBodyLength: edited.body.length });

    const updated = await prisma.emailMessage.update({
      where: { id: email.id },
      data: {
        subject: edited.subject,
        body: edited.body,
        // Any edit invalidates a prior approval.
        approvalHash: null,
        approvalExpiresAt: null,
      },
    });

    return ok({ email: { id: updated.id, subject: updated.subject, body: updated.body, status: updated.status } });
  } catch (err) {
    return handleError(err);
  }
}