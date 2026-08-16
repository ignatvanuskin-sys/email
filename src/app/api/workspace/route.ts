import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { ensureWorkspace } from "@/lib/workspace";

export async function GET() {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); return ok({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, logoUrl: workspace.logoUrl, brandColor: workspace.brandColor, customDomain: workspace.customDomain }, role: workspace.memberships.find((membership) => membership.userId === user.id)?.role ?? "Owner" }); } catch (error) { return handleError(error); }
}

export async function PATCH(req: Request) {
  try { const user = await getApiUser(); if (!user) return unauthorized(); const workspace = await ensureWorkspace(user); const membership = workspace.memberships.find((item) => item.userId === user.id); if (!membership || !["Owner", "Admin"].includes(membership.role)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }); const data = await readJson(req) as { name?: string; logoUrl?: string | null; brandColor?: string; customDomain?: string | null }; const updated = await (await import("@/lib/prisma")).prisma.workspace.update({ where: { id: workspace.id }, data: { name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : undefined, logoUrl: data.logoUrl, brandColor: data.brandColor, customDomain: data.customDomain } }); return ok({ workspace: updated }); } catch (error) { return handleError(error); }
}
