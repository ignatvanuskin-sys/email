import { createHash } from "node:crypto";
import { prisma } from "./prisma";

export function contentHash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function createCampaignVersion(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId }, include: { variants: true } });
  if (!campaign) return null;
  const snapshot = { name: campaign.name, description: campaign.description, templateId: campaign.templateId, sequenceId: campaign.sequenceId, segmentId: campaign.segmentId, variants: campaign.variants.map((variant) => ({ id: variant.id, name: variant.name, subject: variant.subject, body: variant.body, weight: variant.weight })) };
  const latest = await prisma.campaignVersion.findFirst({ where: { campaignId }, orderBy: { version: "desc" } });
  const version = (latest?.version ?? 0) + 1;
  return prisma.campaignVersion.create({ data: { campaignId, version, snapshot: JSON.stringify(snapshot), contentHash: contentHash(snapshot), createdBy: userId } });
}
