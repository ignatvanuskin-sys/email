import { prisma } from "@/lib/prisma";
import { getApiUser, handleError, notFound, ok, readJson, unauthorized, badRequest } from "@/lib/api";
import { z } from "zod";
import { ensureWorkspace, roleCan, writeAudit } from "@/lib/workspace";

const variantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().default("Variant"),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(50000),
  weight: z.number().int().min(0).max(100).optional().default(50),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const workspace = await ensureWorkspace(user);
    const membership = workspace.memberships.find((item) => item.userId === user.id);
    if (!membership || !roleCan(membership.role, "Marketer")) return badRequest("Your workspace role cannot edit variants");
    if (campaign.status !== "Draft") return badRequest("Variants can only be added to draft campaigns");

    const body = await readJson(req);
    const d = variantSchema.parse(body);
    const variant = await prisma.campaignVariant.create({
      data: { campaignId: id, name: d.name, subject: d.subject, body: d.body, weight: d.weight },
    });
    await prisma.campaign.update({ where: { id }, data: { activeVersionId: null, approvalHash: null, approvalExpiresAt: null } });
    await writeAudit(user.id, "campaign.variant_added", "Campaign", id, { variantId: variant.id }, workspace.id);
    return ok({ variant }, 201);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const variants = await prisma.campaignVariant.findMany({ where: { campaignId: id } });
    return ok({ variants });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
    if (!campaign) return notFound("Campaign not found");
    const url = new URL(req.url);
    const variantId = url.searchParams.get("variantId");
    if (!variantId) return badRequest("variantId is required");
    await prisma.campaignVariant.delete({ where: { id: variantId } });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
