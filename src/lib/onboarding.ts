import { prisma } from "./prisma";

export const ONBOARDING_STEPS = [
  { id: "profile", label: "Complete your business profile", href: "/settings" },
  { id: "leads", label: "Add your first lead", href: "/leads/new" },
  { id: "template", label: "Create an email template", href: "/templates/new" },
  { id: "provider", label: "Connect an email provider", href: "/settings" },
  { id: "domain", label: "Verify a sending domain", href: "/deliverability" },
  { id: "campaign", label: "Create a campaign", href: "/campaigns/new" },
] as const;

export async function getOnboardingProgress(userId: string) {
  const [user, leads, templates, provider, domain, campaign] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { businessDescription: true } }),
    prisma.lead.count({ where: { userId } }),
    prisma.emailTemplate.count({ where: { userId } }),
    prisma.provider.count({ where: { userId, kind: "email", isActive: true } }),
    prisma.sendingDomain.count({ where: { userId, overallStatus: "Verified" } }),
    prisma.campaign.count({ where: { userId } }),
  ]);
  const completed = { profile: Boolean(user?.businessDescription.trim()), leads: leads > 0, template: templates > 0, provider: provider > 0, domain: domain > 0, campaign: campaign > 0 };
  const done = ONBOARDING_STEPS.filter((step) => completed[step.id]).length;
  return { completed, done, total: ONBOARDING_STEPS.length, percent: Math.round((done / ONBOARDING_STEPS.length) * 100), steps: ONBOARDING_STEPS.map((step) => ({ ...step, completed: completed[step.id] })) };
}
