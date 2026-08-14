import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { mapAndValidateRows, type ImportMapping, type ImportRow, MAX_IMPORT_ROWS } from "@/lib/csv";
import { z } from "zod";

const schema = z.object({
  records: z.array(z.record(z.string(), z.string())).max(MAX_IMPORT_ROWS),
  mappings: z.record(z.string(), z.string()),
  skipDuplicates: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const data = schema.parse(await readJson(req));
    if (!data.mappings.email) return badRequest("Map a source column to Email before importing");
    const existing = new Set((await prisma.lead.findMany({ where: { userId: user.id, email: { not: null } }, select: { email: true } })).map((lead) => lead.email!.toLowerCase()));
    const rows = mapAndValidateRows(data.records as ImportRow[], data.mappings as ImportMapping, existing);
    const valid = rows.filter((row) => row.state === "valid");
    let imported = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of valid) {
        try {
          const lead = await tx.lead.create({ data: {
            userId: user.id,
            email: row.email!,
            name: row.values.name || row.values.companyOrChannel || row.email!.split("@")[0],
            companyOrChannel: row.values.companyOrChannel || "",
            websiteUrl: row.values.websiteUrl || null,
            youtubeUrl: row.values.youtubeUrl || null,
            niche: row.values.niche || null,
            followersCount: parseCount(row.values.followersCount),
            status: "New",
          } });
          await tx.activity.create({ data: { userId: user.id, leadId: lead.id, type: "LeadImported", payload: "{}" } });
          imported++;
        } catch (error) {
          if (!data.skipDuplicates) throw error;
        }
      }
    });
    return ok({ imported, duplicates: rows.filter((row) => row.state === "duplicate").length + valid.length - imported, invalid: rows.filter((row) => row.state === "invalid").length });
  } catch (error) {
    return handleError(error);
  }
}

function parseCount(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
