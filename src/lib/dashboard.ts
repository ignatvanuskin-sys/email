export type Dashboard = {
  counters: {
    totalLeads: number;
    newLeads: number;
    qualified: number;
    contacted: number;
    interested: number;
    clients: number;
    emailsSent: number;
    replies: number;
    replyRate: number;
    pendingFollowUps: number;
  };
  analytics: {
    delivered: number;
    bounced: number;
    failed: number;
    unsubscribed: number;
    totalCampaigns: number;
    runningCampaigns: number;
  };
  hotLeads: Array<{ id: string; name: string; leadScore: number }>;
  dueFollowUps: Array<{
    id: string;
    dueDate: string;
    lead: { id: string; name: string; companyOrChannel: string };
  }>;
  recentReplies: Array<{
    id: string;
    classification: string;
    receivedAt: string;
    lead: { id: string; name: string };
  }>;
  activities: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
    lead: { id: string; name: string } | null;
  }>;
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

const asNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function normalizeDashboard(value: unknown): Dashboard {
  const root = asRecord(value);
  const counters = asRecord(root.counters);

  return {
    counters: {
      totalLeads: asNumber(counters.totalLeads ?? counters["totalЛиды"]),
      newLeads: asNumber(counters.newLeads ?? counters["newЛиды"]),
      qualified: asNumber(counters.qualified),
      contacted: asNumber(counters.contacted),
      interested: asNumber(counters.interested),
      clients: asNumber(counters.clients),
      emailsSent: asNumber(counters.emailsSent),
      replies: asNumber(counters.replies),
      replyRate: asNumber(counters.replyRate),
      pendingFollowUps: asNumber(counters.pendingFollowUps),
    },
    analytics: {
      delivered: asNumber((asRecord(root.analytics).delivered)),
      bounced: asNumber((asRecord(root.analytics).bounced)),
      failed: asNumber((asRecord(root.analytics).failed)),
      unsubscribed: asNumber((asRecord(root.analytics).unsubscribed)),
      totalCampaigns: asNumber((asRecord(root.analytics).totalCampaigns)),
      runningCampaigns: asNumber((asRecord(root.analytics).runningCampaigns)),
    },
    hotLeads: asArray(root.hotLeads ?? root["hotЛиды"]).map((value) => {
      const lead = asRecord(value);
      return {
        id: asString(lead.id),
        name: asString(lead.name),
        leadScore: asNumber(lead.leadScore),
      };
    }),
    dueFollowUps: asArray(root.dueFollowUps).map((value) => {
      const followUp = asRecord(value);
      const lead = asRecord(followUp.lead);
      return {
        id: asString(followUp.id),
        dueDate: asString(followUp.dueDate),
        lead: {
          id: asString(lead.id),
          name: asString(lead.name),
          companyOrChannel: asString(lead.companyOrChannel),
        },
      };
    }),
    recentReplies: asArray(root.recentReplies).map((value) => {
      const reply = asRecord(value);
      const lead = asRecord(reply.lead);
      return {
        id: asString(reply.id),
        classification: asString(reply.classification),
        receivedAt: asString(reply.receivedAt),
        lead: {
          id: asString(lead.id),
          name: asString(lead.name),
        },
      };
    }),
    activities: asArray(root.activities).map((value) => {
      const activity = asRecord(value);
      const lead = asRecord(activity.lead);
      return {
        id: asString(activity.id),
        type: asString(activity.type),
        payload: asRecord(activity.payload),
        createdAt: asString(activity.createdAt),
        lead: lead.id ? { id: asString(lead.id), name: asString(lead.name) } : null,
      };
    }),
  };
}
