import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { emailGenerateSchema } from "@/lib/validation";
import { generateEmail, getActiveAiClient } from "@/lib/ai";
import { applyTemplate } from "@/lib/emailSender";
import { consumeUsage } from "@/lib/usage";

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const usage = await consumeUsage(user.id, "aiGenerations");
    if (!usage.allowed) return badRequest(`AI generation limit reached for this month (${usage.limit})`);
    const body = await readJson(req);
    const d = emailGenerateSchema.parse(body);

    const lead = await prisma.lead.findFirst({ where: { id: d.leadId, userId: user.id } });
    if (!lead) return notFound("Lead not found");

    const insight = JSON.parse(lead.insight || "{}") as {
      opportunity: string;
      pitchAngle: string;
      suggestedOffer: string;
      suggestedTest: string;
      risk: string;
    };

    let template: { subject: string; body: string } | null = null;
    if (d.templateId) {
      const t = await prisma.emailTemplate.findFirst({
        where: { id: d.templateId, userId: user.id },
      });
      if (t) {
        const vars = {
          firstName: lead.name.split(" ")[0],
          name: lead.name,
          companyOrChannel: lead.companyOrChannel,
          niche: lead.niche ?? "",
          opportunity: insight.opportunity ?? "",
          pitchAngle: insight.pitchAngle ?? "",
          suggestedOffer: insight.suggestedOffer ?? "",
          suggestedTest: insight.suggestedTest ?? "",
        };
        template = { subject: applyTemplate(t.subject, vars), body: applyTemplate(t.body, vars) };
      }
    }

    const client = await getActiveAiClient(user.id);
    const draft = await generateEmail(client, {
      lead: {
        name: lead.name,
        companyOrChannel: lead.companyOrChannel,
        niche: lead.niche,
        youtubeUrl: lead.youtubeUrl,
      },
      insight,
      businessDescription: user.businessDescription,
      template,
    });

    const email = await prisma.emailMessage.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        subject: draft.subject,
        body: draft.body,
        status: "Draft",
      },
    });

    await prisma.activity.create({
      data: { userId: user.id, leadId: lead.id, type: "EmailGenerated", payload: JSON.stringify({ emailId: email.id }) },
    });

    return ok({
      email: {
        id: email.id,
        leadId: email.leadId,
        subject: email.subject,
        body: email.body,
        status: email.status,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
