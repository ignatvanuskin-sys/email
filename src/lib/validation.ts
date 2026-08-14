import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().max(120).optional().default(""),
  businessDescription: z.string().trim().max(2000).optional().default(""),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const nullableUrl = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .nullable()
  .default(null);

export const leadCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  companyOrChannel: z.string().trim().max(300).optional().default(""),
  email: z
    .string()
    .email("A valid email is required")
    .optional()
    .nullable()
    .default(null),
  websiteUrl: nullableUrl,
  youtubeUrl: nullableUrl,
  instagramUrl: nullableUrl,
  telegramUrl: nullableUrl,
  niche: z.string().trim().max(120).optional().nullable().default(null),
  followersCount: z.number().int().nonnegative().optional().nullable().default(null),
  contentActivity: z.number().int().min(0).max(100).optional().default(0),
  longFormCount: z.number().int().min(0).optional().default(0),
  shortFormCount: z.number().int().min(0).optional().default(0),
  growthSignal: z.number().int().min(0).max(100).optional().default(0),
  commercialPotential: z.number().int().min(0).max(100).optional().default(0),
  note: z.string().max(3000).optional().default(""),
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  status: z
    .enum(["New", "Analyzed", "Contacted", "Replied", "Interested", "Not Now", "Client", "Lost", "Unsubscribed"])
    .optional(),
});

export const emailGenerateSchema = z.object({
  leadId: z.string().min(1),
  templateId: z.string().optional().nullable(),
  addFollowUp: z.boolean().optional().default(true),
});

export const emailApproveSchema = z.object({
  emailId: z.string().min(1),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(50000),
});

export const emailSendSchema = z.object({
  emailId: z.string().min(1),
});

export const emailEditActionSchema = z.object({
  action: z.enum(["regenerate", "improve", "shorten", "casual", "professional"]),
});

export const replyCreateSchema = z.object({
  leadId: z.string().min(1),
  emailMessageId: z.string().optional().nullable(),
  contentSnippet: z.string().trim().max(10000).optional().default(""),
  classification: z
    .enum(["Replied", "Positive", "Negative", "Interested", "NotNow", "Unsubscribe"])
    .default("Replied"),
});

export const suppressionCreateSchema = z.object({
  email: z.string().email(),
  reason: z.enum(["Unsubscribed", "ManualBlock", "HardBounce", "Complaint"]).default("ManualBlock"),
});

export const providerConnectSchema = z.object({
  type: z.enum(["email", "ai"]),
  platform: z.enum(["SMTP", "GmailOAuth", "Anthropic", "OpenAI", "OpenRouter"]),
  displayName: z.string().trim().max(120).optional().default(""),
  // Credentials as a JSON string of provider-specific fields.
  config: z.string().max(20000),
  dailyLimit: z.number().int().positive().optional().default(25),
});

export const pauseSchema = z.object({
  paused: z.boolean(),
});

export const importMappingsSchema = z.object({
  mappings: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).optional(),
});

export const followUpActionSchema = z.object({
  action: z.enum(["complete", "skip", "reschedule", "cancel"]),
  dueDate: z.string().datetime().optional(),
});