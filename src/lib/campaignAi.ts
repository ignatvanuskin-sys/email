import { chat, type AiClient } from "./ai";

export type BrandContext = { businessDescription: string; tone: string; audience: string; offer: string; forbidden: string };
export type CampaignDraft = { subject: string; preheader: string; body: string; cta: string };
export type SubjectVariant = { text: string; angle: string };

function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

function parseObject(text: string): Record<string, unknown> {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { const match = text.match(/\{[\s\S]*\}/); try { return match ? JSON.parse(match[0]) as Record<string, unknown> : {}; } catch { return {}; } }
}

export async function generateCampaignDraft(client: AiClient, input: { goal: string; audience: string; offer: string; tone: string; brand: BrandContext }): Promise<CampaignDraft> {
  const system = "You are an email marketing copywriter. Never invent product facts. Return ONLY strict JSON with subject, preheader, body, and cta. Write concise plain-text email copy, no markdown and no emojis.";
  const user = JSON.stringify({ task: "Create a campaign email draft", ...input });
  const parsed = parseObject(await chat(client, system, user));
  return { subject: stringValue(parsed.subject) || "A useful update for you", preheader: stringValue(parsed.preheader), body: stringValue(parsed.body) || "Hi {{firstName}},\n\nHere is a useful update for you.", cta: stringValue(parsed.cta) };
}

export async function generateSubjectVariants(client: AiClient, input: { goal: string; audience: string; offer: string; tone: string; brand: BrandContext }): Promise<SubjectVariant[]> {
  const system = "Generate 5 to 10 distinct email subject lines. Return ONLY strict JSON: {\"subjects\":[{\"text\":string,\"angle\":string}]}. Avoid misleading claims, excessive urgency, all caps, and spam wording.";
  const parsed = parseObject(await chat(client, system, JSON.stringify(input)));
  const subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
  return subjects.map((item) => ({ text: stringValue((item as Record<string, unknown>).text), angle: stringValue((item as Record<string, unknown>).angle) })).filter((item) => item.text).slice(0, 10);
}
