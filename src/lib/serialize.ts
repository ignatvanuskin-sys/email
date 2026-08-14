import type { Lead } from "@prisma/client";

type SerializableLead = Lead & {
  _count?: { emails: number; replies: number; followUps: number };
  insight?: string | null;
};

export function mapLead(l: SerializableLead) {
  return {
    id: l.id,
    name: l.name,
    companyOrChannel: l.companyOrChannel,
    email: l.email,
    niche: l.niche,
    youtubeUrl: l.youtubeUrl,
    followersCount: l.followersCount,
    leadScore: l.leadScore,
    scoreBreakdown: safeParse(l.scoreBreakdown),
    insight: l.insight ? safeParse(l.insight) : null,
    status: l.status,
    lastContactAt: l.lastContactAt?.toISOString() ?? null,
    nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    counts: l._count,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}