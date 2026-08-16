import { prisma } from "./prisma";

type CohortRow = { cohort: string; contacts: number; active: number; purchases: number; revenue: number; retentionRate: number; revenuePerContact: number };

function month(date: Date): string { return date.toISOString().slice(0, 7); }
function amount(properties: string): number { try { const value = Number((JSON.parse(properties) as Record<string, unknown>).amount ?? (JSON.parse(properties) as Record<string, unknown>).revenue ?? 0); return Number.isFinite(value) && value >= 0 ? value : 0; } catch { return 0; } }

export async function aggregateCohorts(userId: string, from?: Date, to?: Date): Promise<CohortRow[]> {
  const events = await prisma.event.findMany({ where: { userId, ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, orderBy: { occurredAt: "asc" }, select: { leadId: true, type: true, properties: true, occurredAt: true } });
  const firstContact = new Map<string, string>();
  const firstPurchase = new Set<string>();
  const rows = new Map<string, { contacts: Set<string>; active: Set<string>; purchases: number; revenue: number }>();
  for (const event of events) {
    if (!event.leadId) continue;
    const existing = firstContact.get(event.leadId);
    if (!existing && ["contact.created", "lead.created", "signup"].includes(event.type)) firstContact.set(event.leadId, month(event.occurredAt));
  }
  for (const event of events) {
    if (!event.leadId) continue;
    const cohort = firstContact.get(event.leadId) ?? month(event.occurredAt);
    const row = rows.get(cohort) ?? { contacts: new Set<string>(), active: new Set<string>(), purchases: 0, revenue: 0 };
    row.contacts.add(event.leadId);
    if (["email.opened", "email.clicked", "purchase", "conversion", "active"].includes(event.type)) row.active.add(event.leadId);
    if (["purchase", "order.paid", "conversion"].includes(event.type) && !firstPurchase.has(`${event.leadId}:${event.occurredAt.toISOString()}`)) { row.purchases++; row.revenue += amount(event.properties); firstPurchase.add(`${event.leadId}:${event.occurredAt.toISOString()}`); }
    rows.set(cohort, row);
  }
  return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, row]) => ({ cohort, contacts: row.contacts.size, active: row.active.size, purchases: row.purchases, revenue: Math.round(row.revenue * 100) / 100, retentionRate: row.contacts.size ? Math.round((row.active.size / row.contacts.size) * 1000) / 10 : 0, revenuePerContact: row.contacts.size ? Math.round((row.revenue / row.contacts.size) * 100) / 100 : 0 }));
}
