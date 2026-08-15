import { prisma } from "./prisma";
import { decryptCredentials } from "./crypto";
import { env } from "./env";
import type { AiProviderType } from "./status";
import { chatOpenRouter } from "./openrouter";

const AI_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Provider-agnostic AI layer (spec §16): single `generate/chat` interface that
// abstracts Anthropic / OpenAI / Mock. All AI output must be reviewed by the
// user before it is sent (human-in-the-loop).
// ---------------------------------------------------------------------------

export type AiClient = {
  type: AiProviderType;
  apiKey?: string;
  model?: string;
};

export async function getActiveAiClient(userId: string): Promise<AiClient> {
  if (env.MOCK_AI) {
    return { type: "Mock", model: "mock-1" };
  }
  const provider = await prisma.provider.findFirst({
    where: { userId, kind: "ai", isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!provider) {
    throw new Error("AI provider not connected");
  }
  let config: { apiKey?: string; model?: string; platform?: string };
  try {
    config = JSON.parse(decryptCredentials(provider.configEncrypted));
  } catch {
    config = {};
  }
  const type = (config.platform === "Anthropic" ? "Anthropic" : config.platform === "OpenRouter" ? "OpenRouter" : "OpenAI") as AiProviderType;
  return { type, apiKey: config.apiKey, model: config.model ?? defaultModel(type) };
}

function defaultModel(type: AiProviderType): string {
  return type === "Anthropic" ? env.ANTHROPIC_MODEL : env.OPENAI_MODEL;
}

/** Low-level chat call. Returns the assistant text. */
export async function chat(client: AiClient, system: string, user: string): Promise<string> {
  if (client.type === "Mock") {
    // Deterministic mock so the whole MVP is runnable without an API key.
    return mockResponse(system, user);
  }
  if (client.type === "Anthropic") {
    return chatAnthropic(client, system, user);
  }
  if (client.type === "OpenRouter") {
    if (!client.apiKey) throw new Error("OpenRouter API key is not configured");
    if (!client.model) throw new Error("OpenRouter model is not selected");
    return chatOpenRouter(client.apiKey, client.model, system, user);
  }
  return chatOpenAI(client, system, user);
}

async function chatAnthropic(client: AiClient, system: string, user: string): Promise<string> {
  const key = client.apiKey ?? env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Anthropic API key missing");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: client.model ?? env.ANTHROPIC_MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic provider request failed (${res.status})`);
  const data = (await res.json()) as { content: Array<{ text: string }> };
  return data.content.map((c) => c.text).join("");
}

async function chatOpenAI(client: AiClient, system: string, user: string): Promise<string> {
  const key = client.apiKey ?? env.OPENAI_API_KEY;
  if (!key) throw new Error("OpenAI API key missing");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: client.model ?? env.OPENAI_MODEL,
      max_tokens: 2000,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI provider request failed (${res.status})`);
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message.content ?? "";
}
// ---------------------------------------------------------------------------
// Analysis (spec §16 / §10.1): returns structured insight + scoring hints.
// ---------------------------------------------------------------------------

export type AnalyzeResult = {
  opportunity: string;
  pitchAngle: string;
  suggestedOffer: string;
  suggestedTest: string;
  risk: string;
  // scoring hints used to derive lead_score
  contentActivity: number;
  longFormCount: number;
  shortFormCount: number;
  growthSignal: number;
  commercialPotential: number;
};

export type AnalyzeContext = {
  name: string;
  companyOrChannel: string;
  niche?: string | null;
  youtubeUrl?: string | null;
  followersCount?: number | null;
  businessDescription: string;
};

const JSON_ONLY =
  "Respond with ONLY a strict JSON object. No markdown, no prose. " +
  'Shape: {"opportunity":string,"pitchAngle":string,"suggestedOffer":string,"suggestedTest":string,"risk":string,' +
  '"contentActivity":0-100,"longFormCount":int,"shortFormCount":int,"growthSignal":0-100,"commercialPotential":0-100}. ' +
  "Do NOT invent statistics or facts not present in the input data.";

export async function analyzeLead(
  client: AiClient,
  ctx: AnalyzeContext,
): Promise<AnalyzeResult> {
  const system =
    "You are a sharp outbound-marketing strategist for a freelance " +
    "short-form video editor. You analyze content creators and decide why they need " +
    "short-form repurposing, and craft a personalized pitch angle.";
  const user = JSON.stringify(
    {
      lead: {
        name: ctx.name,
        channel: ctx.companyOrChannel,
        niche: ctx.niche,
        youtubeUrl: ctx.youtubeUrl,
        followersCount: ctx.followersCount,
      },
      serviceTheUserSells:
        ctx.businessDescription ||
        "Short-form video editing / repurposing long content into Reels, Shorts and TikToks.",
      task: "Assess this creator and provide an outreach opportunity.",
    },
    null,
    2,
  );
  const text = await chat(client, `${system}\n\n${JSON_ONLY}`, user);
  return parseAnalyze(extractJson(text), ctx);
}

export function parseAnalyze(json: Partial<AnalyzeResult>, ctx: AnalyzeContext): AnalyzeResult {
  const num = (v: unknown, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
  };
  return {
    opportunity:
      str(json.opportunity) ||
      `A strong fit for ${ctx.companyOrChannel || ctx.name} to grow reach with Shorts/Reels.`,
    pitchAngle:
      str(json.pitchAngle) ||
      "Repurpose existing long-form into weekly vertical clips to grow reach without new filming.",
    suggestedOffer:
      str(json.suggestedOffer) ||
      "A 3-clip test package to see reaction before committing.",
    suggestedTest: str(json.suggestedTest) || "One 30-60s Short cut from their best recent video.",
    risk: str(json.risk) || "Verify they actually want outsourced editing vs in-house production.",
    contentActivity: num(json.contentActivity, 40),
    longFormCount: Math.max(0, Math.round(Number(json.longFormCount) || 0)),
    shortFormCount: Math.max(0, Math.round(Number(json.shortFormCount) || 0)),
    growthSignal: num(json.growthSignal, 30),
    commercialPotential: num(json.commercialPotential, 40),
  };
}

const GENERIC_EDIT_PATTERNS = [
  /^hi there[,!]?$/im,
  /following up with a concise idea/i,
  /just reaching out/i,
  /would you be open to a quick test/i,
  /here(?:'|’)s a concise idea/i,
  /hope you(?:'|’)re doing well/i,
  /just checking in/i,
];

function validateEditedEmail(current: { subject: string; body: string }, edited: { subject: string; body: string }): void {
  if (!edited.body || edited.body.length < 20) throw new Error("AI returned an empty or unusable edited email");
  if (GENERIC_EDIT_PATTERNS.some((pattern) => pattern.test(edited.body)) && !GENERIC_EDIT_PATTERNS.some((pattern) => pattern.test(current.body))) {
    throw new Error("AI returned a generic email instead of rewriting the current email");
  }
  const sourceWords = current.body.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  const meaningful = [...new Set(sourceWords)].filter((word) => !["this", "that", "with", "your", "from", "would", "have", "into", "they", "their"].includes(word));
  const retained = meaningful.filter((word) => edited.body.toLowerCase().includes(word)).length;
  if (meaningful.length >= 3 && retained / meaningful.length < 0.12) {
    throw new Error("AI rewrite lost the specific context of the current email");
  }
}

function str(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}
// ---------------------------------------------------------------------------
// Email generation + editing (spec §16).
// ---------------------------------------------------------------------------

export type EmailContext = {
  lead: {
    name: string;
    companyOrChannel: string;
    niche?: string | null;
    youtubeUrl?: string | null;
  };
  insight: {
    opportunity: string;
    pitchAngle: string;
    suggestedOffer: string;
    suggestedTest: string;
    risk: string;
  };
  businessDescription: string;
  template?: { subject: string; body: string } | null;
};

export async function generateEmail(
  client: AiClient,
  ctx: EmailContext,
): Promise<{ subject: string; body: string }> {
  const system =
    "You write concise, warm, non-spammy cold emails for a freelance short-form video editor. " +
    "Use the lead's actual context. Never invent statistics. Keep the body 80-140 words. No emojis. End with a low-pressure question.";
  const user =
    "Lead: " + JSON.stringify(ctx.lead) +
    "\nService: " + (ctx.businessDescription || "Short-form video editing") +
    "\nStrategy insight: " + JSON.stringify(ctx.insight) +
    (ctx.template ? "\nReference template (adapt tone, keep placeholders): " + JSON.stringify(ctx.template) : "") +
    '\n\nWrite the email. Respond with ONLY JSON: {"subject":string,"body":string}. Body uses "\\n\\n" for paragraphs. The body must contain only the final email, with no introduction, explanation, markdown fences, or meta commentary.';
  const text = await chat(client, system, user);
  const parsed = extractJson(text);
  const subject = str(parsed.subject) || "Idea for growing your reach with Shorts";
  const bodyRaw = cleanEmailText(str(parsed.body));
  return { subject: cleanEmailText(subject), body: bodyRaw ? bodyRaw : buildFallbackBody(ctx) };
}

export type EditAction = "regenerate" | "improve" | "shorten" | "casual" | "professional";

export async function editEmail(
  client: AiClient,
  action: EditAction,
  current: { subject: string; body: string },
  leadContext?: Record<string, unknown>,
): Promise<{ subject: string; body: string }> {
  const instruction = {
    regenerate: "Write a meaningfully different version from scratch with the same purpose, recipient, offer, facts and CTA.",
    improve: "Improve clarity, warmth and persuasiveness while preserving the recipient, core offer, facts, personalization and intent.",
    shorten: "Make it substantially shorter, preserving the main value proposition, personalization and CTA. Target under 70 words.",
    casual: "Rewrite in a natural, conversational style. Avoid corporate jargon, excessive formality and generic AI language.",
    professional: "Rewrite in a polished professional style. Avoid corporate fluff, unnatural wording and generic AI phrases.",
  }[action];
  const system =
    "You edit a short cold email. Never invent facts. Return ONLY strict JSON with subject and body. " +
    "The body must contain ONLY the final email intended for the recipient. Do not include an introduction, explanation, commentary, markdown fences, or phrases such as 'Here's the updated version you asked for', 'Here is the revised email', or 'Sure, here is'.";
  const user =
    "CURRENT SUBJECT:\n" + current.subject +
    "\n\nCURRENT EMAIL:\n" + current.body +
    "\n\nLEAD CONTEXT:\n" + JSON.stringify(leadContext ?? {}) +
    "\n\nACTION:\n" + action + " — " + instruction +
    "\n\nRewrite the CURRENT EMAIL according to ACTION. Do not create a generic outreach email. Do not remove the specific offer, personalization, CTA, service, facts, or recipient context. Do not invent a different service or recipient/context. Return ONLY the final subject/body intended for the recipient.";
  const text = await chat(client, system, user);
  const parsed = extractJson(text);
  const subject = cleanEmailText(str(parsed.subject) || current.subject);
  const body = cleanEmailText(str(parsed.body));
  const result = { subject, body };
  validateEditedEmail(current, result);
  return result;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Removes only known wrapper/meta prefixes; legitimate email content is preserved.
const META_PREFIXES = [
  /^here(?:'|’)s the (?:updated|revised|improved) version[^:\n]*:?\s*/i,
  /^here is the (?:updated|revised|improved) version[^:\n]*:?\s*/i,
  /^sure[,!:]?\s*(?:here(?:'|’)s|here is)[^:\n]*:?\s*/i,
];

export function cleanEmailText(text: string): string {
  let value = text.trim().replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
  for (const prefix of META_PREFIXES) value = value.replace(prefix, "").trim();
  return value;
}

function extractJson(text: string): Record<string, unknown> {
  const clean = text.trim();
  try {
    const obj = JSON.parse(clean) as Record<string, unknown>;
    if (obj && typeof obj === "object") return obj;
  } catch {
    // fall through
  }
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  return {};
}

function buildFallbackBody(ctx: EmailContext): string {
  const name = ctx.lead.name || "there";
  const channel = ctx.lead.companyOrChannel || "your channel";
  return [
    `Hi ${name},`,
    ``,
    `I've been looking at ${channel} and your content is genuinely under-leveraged - you clearly put real work into long videos, but most of that audience never sees it on Shorts, Reels or TikTok.`,
    ``,
    `${ctx.insight.opportunity}`,
    ``,
    `I help creators turn one long video into several short clips that bring new viewers back to the main channel. I'd love to cut a quick 30-second test from one of your recent videos, free, so you can see the reaction before deciding anything.`,
    ``,
    `Want me to send it over?`,
    ``,
    `Best,`,
    `[Your name]`,
  ].join("\n");
}

// Deterministic mock used when MOCK_AI=true so the MVP runs offline.
function mockResponse(system: string, user: string): string {
  const ctx: Record<string, string> = {};
  for (const m of user.matchAll(/"([A-Za-z]+)":\s*"([^"]*)"/g)) {
    if (!(m[1] in ctx)) ctx[m[1]] = m[2];
  }
  const name = ctx["name"] || "this creator";
  const channel = ctx["channel"] || "their channel";

  if (system.includes("outbound-marketing strategist")) {
    return JSON.stringify({
      opportunity:
        `${channel} publishes valuable long-form but lacks short clips, missing a big reach channel.`,
      pitchAngle:
        "Turn one long video into several Shorts to multiply reach and feed the main channel - no extra filming.",
      suggestedOffer: "A low-risk 3-clip test package to validate the format with the audience.",
      suggestedTest: "One 30-60s Short cut from their best recent video.",
      risk: "Confirm they're open to outsourcing editing vs producing in-house.",
      contentActivity: 60,
      longFormCount: 10,
      shortFormCount: 0,
      growthSignal: 40,
      commercialPotential: 55,
    });
  }
  if (system.includes("write concise, warm")) {
    return JSON.stringify({
      subject: "Idea for growing reach on Shorts",
      body:
        `Hi ${name},\n\n` +
        `I've been seeing ${channel} show up and noticed your long-form isn't reaching the Shorts/Reels audience yet.\n\n` +
        `I help creators turn one long video into several short clips that pull new viewers back to the main channel. I'd love to cut a quick 30-second test from a recent video, free, so you can judge the result yourself.\n\n` +
        `Want me to send it over?`,
    });
  }
  const currentMatch = user.match(/CURRENT EMAIL:\n([\s\S]*?)(?:\n\nLEAD CONTEXT:|$)/);
  const current = currentMatch?.[1]?.trim() || "Hi there,\n\nI help creators turn long-form video into Shorts and can make a free sample.\n\nWant me to send it over?";
  return JSON.stringify({ subject: "Re: your email", body: current });
}