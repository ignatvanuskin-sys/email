// Central enumeration of domain statuses and small helpers.
// Strings are stored in DB as-is; these constants are the single source of truth.

export const LEAD_STATUS = {
  NEW: "New",
  ANALYZED: "Analyzed",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  NOT_NOW: "Not Now",
  CLIENT: "Client",
  LOST: "Lost",
  UNSUBSCRIBED: "Unsubscribed",
} as const;
export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const SUPPRESSED_LEAD_STATUSES: LeadStatus[] = [
  LEAD_STATUS.UNSUBSCRIBED,
  LEAD_STATUS.CLIENT,
];

export const EMAIL_STATUS = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
  RETRY: "Retry",
} as const;
export type EmailStatus = (typeof EMAIL_STATUS)[keyof typeof EMAIL_STATUS];

export const CAMPAIGN_STATUS = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  STOPPED: "Stopped",
} as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

export const CAMPAIGN_LEAD_STATUS = {
  PENDING: "Pending",
  SENT: "Sent",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
  SKIPPED: "Skipped",
} as const;
export type CampaignLeadStatus = (typeof CAMPAIGN_LEAD_STATUS)[keyof typeof CAMPAIGN_LEAD_STATUS];

export const FOLLOWUP_STATUS = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
  CANCELLED: "Cancelled",
} as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUS)[keyof typeof FOLLOWUP_STATUS];

export const SUPPRESSION_REASON = {
  UNSUBSCRIBED: "Unsubscribed",
  MANUAL_BLOCK: "ManualBlock",
  HARD_BOUNCE: "HardBounce",
  COMPLAINT: "Complaint",
} as const;
export type SuppressionReason =
  (typeof SUPPRESSION_REASON)[keyof typeof SUPPRESSION_REASON];

export const PROVIDER_KIND = {
  EMAIL: "email",
  AI: "ai",
} as const;
export type ProviderKind = (typeof PROVIDER_KIND)[keyof typeof PROVIDER_KIND];

export const EMAIL_PROVIDER_TYPE = {
  SMTP: "SMTP",
  GMAIL_OAUTH: "GmailOAuth",
  MOCK: "Mock",
} as const;
export type EmailProviderType =
  (typeof EMAIL_PROVIDER_TYPE)[keyof typeof EMAIL_PROVIDER_TYPE];

export const AI_PROVIDER_TYPE = {
  ANTHROPIC: "Anthropic",
  OPENAI: "OpenAI",
  OPENROUTER: "OpenRouter",
  MOCK: "Mock",
} as const;
export type AiProviderType = (typeof AI_PROVIDER_TYPE)[keyof typeof AI_PROVIDER_TYPE];

export const REPLY_CLASSIFICATION = {
  NO_REPLY: "NoReply",
  REPLIED: "Replied",
  POSITIVE: "Positive",
  NEGATIVE: "Negative",
  INTERESTED: "Interested",
  NOT_NOW: "NotNow",
  UNSUBSCRIBE: "Unsubscribe",
} as const;
export type ReplyClassification =
  (typeof REPLY_CLASSIFICATION)[keyof typeof REPLY_CLASSIFICATION];

export const SCORE_TIERS = {
  HOT: { min: 80, label: "HOT", emoji: "🔥" },
  WARM: { min: 50, label: "WARM", emoji: "🟡" },
  COLD: { min: 0, label: "COLD", emoji: "⚪" },
} as const;
export type ScoreTier = keyof typeof SCORE_TIERS;

export function scoreTier(score: number): ScoreTier {
  if (score >= SCORE_TIERS.HOT.min) return "HOT";
  if (score >= SCORE_TIERS.WARM.min) return "WARM";
  return "COLD";
}

export const DEFAULT_FOLLOWUP_DELAY_DAYS = 4;