import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { authenticateApiKey } from "@/lib/apiKeys";
import { prisma } from "@/lib/prisma";
import { inspectEmail } from "@/lib/emailHygiene";
import { consumeUsage } from "@/lib/usage";
import { consumeRateLimit } from "@/lib/rateLimit";

const schema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(200).optional().default(""),
  companyOrChannel: z.string().trim().max(300).optional().default(""),
  niche: z.string().trim().max(120).optional().nullable(),
  websiteUrl: z.string().url().max(1000).optional().nullable(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(req: Request) {
  const user = await authenticateApiKey(req, "contacts:write");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await consumeRateLimit(`api:contacts:${user.id}`, 120, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Rate limit exceeded", resetAt: rate.resetAt.toISOString() }, { status: 429 });
  try {
    const data = schema.parse(await req.json());
    const hygiene = inspectEmail(data.email);
    if (!hygiene.valid || hygiene.disposable) return apiError(hygiene.reasons.join("; ") || "Invalid contact email", 422, "CONTACT_EMAIL_INVALID");
    const updateData = { name: data.name || undefined, companyOrChannel: data.companyOrChannel, niche: data.niche ?? undefined, websiteUrl: data.websiteUrl ?? undefined, emailQuality: hygiene.quality, emailRisk: hygiene.reasons.join(", ") || null, emailCheckedAt: new Date(), isRoleBased: hygiene.roleBased };
    const existing = await prisma.lead.findUnique({ where: { userId_email: { userId: user.id, email: hygiene.normalized } }, select: { id: true } });
    if (existing) {
      const lead = await prisma.lead.update({ where: { id: existing.id }, data: updateData });
      return NextResponse.json({ contact: { id: lead.id, email: lead.email, name: lead.name, createdAt: lead.createdAt.toISOString() }, created: false }, { status: 200 });
    }

    const usage = await consumeUsage(user.id, "contacts");
    if (!usage.allowed) return NextResponse.json({ error: "Contact limit reached", code: "QUOTA_EXCEEDED", usage }, { status: 429 });
    const lead = await prisma.lead.upsert({
      where: { userId_email: { userId: user.id, email: hygiene.normalized } },
      create: { userId: user.id, email: hygiene.normalized, name: data.name || hygiene.normalized.split("@")[0], companyOrChannel: data.companyOrChannel, niche: data.niche ?? null, websiteUrl: data.websiteUrl ?? null, emailQuality: hygiene.quality, emailRisk: hygiene.reasons.join(", ") || null, emailCheckedAt: new Date(), isRoleBased: hygiene.roleBased },
      update: updateData,
    });
    return NextResponse.json({ contact: { id: lead.id, email: lead.email, name: lead.name, createdAt: lead.createdAt.toISOString() }, created: true }, { status: 201 });
  } catch (error) {
    console.error("[api-contacts-error]", { error });
    return apiError("Invalid request", 400, "BAD_REQUEST");
  }
}
