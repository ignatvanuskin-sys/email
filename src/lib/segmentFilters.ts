import type { Prisma } from "@prisma/client";

export type SegmentFilter = { field: string; op?: string; value: string };

export function parseSegmentFilters(raw: string): SegmentFilter[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SegmentFilter => Boolean(item && typeof item === "object" && typeof (item as SegmentFilter).field === "string" && typeof (item as SegmentFilter).value === "string"));
  } catch { return []; }
}

export function segmentLeadWhere(userId: string, filters: SegmentFilter[]): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { userId };
  const and: Prisma.LeadWhereInput[] = [];
  for (const filter of filters) {
    if (!filter.value.trim()) continue;
    if (filter.field === "status") and.push({ status: filter.value });
    if (filter.field === "score") { const score = Number(filter.value); if (Number.isFinite(score)) and.push({ leadScore: { gte: Math.round(score) } }); }
    if (filter.field === "niche") and.push({ niche: { contains: filter.value } });
    if (filter.field === "emailQuality") and.push({ emailQuality: filter.value });
  }
  return and.length ? { ...where, AND: and } : where;
}
