import { decryptCredentials } from "./crypto";
import { prisma } from "./prisma";
import { analyzeCampaignPreflight, checkLinks, extractHttpLinks, senderDomain, type CampaignContent, type CampaignPreflightResult } from "./preflight";

export async function runCampaignPreflight(userId: string, campaignId: string, includeLinkChecks = true): Promise<CampaignPreflightResult | null> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } });
  if (!campaign) return null;
  const [provider, variants, sequence] = await Promise.all([
    prisma.provider.findFirst({ where: { userId, kind: "email", isActive: true }, orderBy: { createdAt: "desc" } }),
    prisma.campaignVariant.findMany({ where: { campaignId } }),
    campaign.sequenceId ? prisma.sequence.findFirst({ where: { id: campaign.sequenceId, userId }, include: { steps: { where: { enabled: true }, orderBy: { position: "asc" } } } }) : null,
  ]);
  const contents: CampaignContent[] = variants.length ? variants.map((variant) => ({ source: variant.name, subject: variant.subject, body: variant.body })) : sequence?.steps.length ? sequence.steps.map((step) => ({ source: `Sequence step ${step.position + 1}`, subject: step.subject, body: step.body })) : [];
  if (!contents.length && campaign.templateId) {
    const template = await prisma.emailTemplate.findFirst({ where: { id: campaign.templateId, userId } });
    if (template) contents.push({ source: template.name, subject: template.subject, body: template.documentJson ?? template.body });
  }
  let fromAddress: string | null = null;
  if (provider) {
    try {
      const config = JSON.parse(decryptCredentials(provider.configEncrypted)) as { from?: string; user?: string };
      fromAddress = config.from?.trim() || config.user?.trim() || null;
    } catch {
      fromAddress = null;
    }
  }
  const domain = senderDomain(fromAddress);
  const sendingDomain = domain ? await prisma.sendingDomain.findUnique({ where: { userId_domain: { userId, domain } } }) : null;
  const result = analyzeCampaignPreflight({ contents, providerConfigured: Boolean(provider), fromAddress, sendingDomainStatus: sendingDomain?.overallStatus ?? null });
  if (!includeLinkChecks || !contents.length) return result;
  const linkIssues = await checkLinks([...new Set(contents.flatMap((content) => extractHttpLinks(content.body)))]);
  return { ...result, warnings: result.warnings + linkIssues.length, issues: [...result.issues, ...linkIssues] };
}
