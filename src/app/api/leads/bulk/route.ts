import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";
import { inspectEmail } from "@/lib/emailHygiene";
import { consumeUsage } from "@/lib/usage";

const bulkSchema = z.object({
  leads: z.array(
    z.object({
      email: z.string().trim().min(1),
      name: z.string().trim().min(1).default(""),
      companyOrChannel: z.string().trim().max(300).optional().default(""),
      websiteUrl: z.string().trim().max(1000).optional().nullable().default(null),
      niche: z.string().trim().max(120).optional().nullable().default(null),
      followersCount: z.number().int().nonnegative().optional().nullable().default(null),
    })
  ).min(1, "At least one lead is required").max(500, "Maximum 500 leads per batch"),
  skipDuplicates: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const body = await readJson(req);
    const { leads, skipDuplicates } = bulkSchema.parse(body);

    // Normalize emails and validate
    const normalized = leads.map((l) => ({
      ...l,
      email: l.email.toLowerCase().trim(),
      name: l.name.trim() || l.email.split("@")[0],
    }));

    // Check usage limit before doing work
    const usage = await consumeUsage(user.id, "contacts", normalized.length);
    if (!usage.allowed) return badRequest(`Contact limit reached for this month (${usage.limit})`);

    const existingEmails = new Set(
      (await prisma.lead.findMany({ where: { userId: user.id, email: { not: null } }, select: { email: true } }))
        .map((r) => r.email!.toLowerCase())
    );

    const seen = new Set<string>();
    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    const errors: Array<{ index: number; email: string; reason: string }> = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < normalized.length; i++) {
        const row = normalized[i];
        const hygiene = inspectEmail(row.email);
        if (!hygiene.valid || hygiene.disposable) {
          invalid++;
          errors.push({ index: i, email: row.email, reason: hygiene.valid ? "Disposable email" : "Invalid email" });
          continue;
        }
        const lower = row.email.toLowerCase();
        if (existingEmails.has(lower) || seen.has(lower)) {
          duplicates++;
          if (!skipDuplicates) {
            errors.push({ index: i, email: row.email, reason: "Duplicate" });
          }
          continue;
        }
        seen.add(lower);
        try {
          const lead = await tx.lead.create({
            data: {
              userId: user.id,
              email: row.email,
              name: row.name,
              companyOrChannel: row.companyOrChannel ?? "",
              websiteUrl: row.websiteUrl ?? null,
              niche: row.niche ?? null,
              followersCount: row.followersCount ?? null,
              status: "New",
              emailQuality: hygiene.quality,
              emailRisk: hygiene.reasons.join(", ") || null,
              emailCheckedAt: new Date(),
              isDisposable: hygiene.disposable,
              isRoleBased: hygiene.roleBased,
            },
          });
          await tx.activity.create({ data: { userId: user.id, leadId: lead.id, type: "LeadCreated", payload: JSON.stringify({ bulk: true }) } });
          imported++;
          existingEmails.add(lower);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("Unique constraint")) {
            duplicates++;
          } else {
            invalid++;
            errors.push({ index: i, email: row.email, reason: "Insert failed" });
          }
        }
      }
    });

    return ok({ imported, duplicates, invalid, errors, total: normalized.length });
  } catch (err) {
    return handleError(err);
  }
}
