import { domainToASCII } from "node:url";

export type PreflightSeverity = "error" | "warning";
export type PreflightIssue = {
  code: string;
  severity: PreflightSeverity;
  message: string;
  source?: string;
  field?: "subject" | "body" | "links" | "domain" | "provider";
};

export type CampaignContent = { source: string; subject: string; body: string };
export type CampaignPreflightInput = {
  contents: CampaignContent[];
  providerConfigured: boolean;
  fromAddress: string | null;
  sendingDomainStatus: string | null;
};

export type CampaignPreflightResult = {
  ready: boolean;
  errors: number;
  warnings: number;
  checkedAt: string;
  issues: PreflightIssue[];
};

const SPAM_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:act now|buy now|click here|free money|guaranteed income)\b/i, "Aggressive promotional wording may trigger spam filters"],
  [/\b(?:urgent|winner|congratulations)\b/i, "High-risk urgency wording detected"],
  [/(?:\$|€|£)\s*\d+(?:,\d{3})*(?:\.\d+)?\s*(?:guaranteed|free)/i, "Money claim may trigger spam filters"],
];

export function extractHttpLinks(body: string): string[] {
  const links: string[] = [];
  const pattern = /https?:\/\//gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    let end = match.index + match[0].length;
    while (end < body.length && !/[\s<>"')\]]/.test(body[end])) end++;
    const link = body.slice(match.index, end).replace(/[.,;!?]+$/, "");
    if (link) links.push(link);
  }
  return [...new Set(links)];
}

export function analyzeCampaignPreflight(input: CampaignPreflightInput): CampaignPreflightResult {
  const issues: PreflightIssue[] = [];
  if (!input.providerConfigured) issues.push({ code: "provider_missing", severity: "error", field: "provider", message: "Connect an active email provider before starting the campaign" });
  if (!input.fromAddress) issues.push({ code: "from_missing", severity: "error", field: "provider", message: "Configure a valid From address in email provider settings" });
  if (input.fromAddress && input.sendingDomainStatus === null) issues.push({ code: "domain_not_added", severity: "warning", field: "domain", message: "Add the From domain to Deliverability Center and publish SPF, DKIM and DMARC" });
  if (input.sendingDomainStatus && input.sendingDomainStatus !== "Verified") issues.push({ code: "domain_unverified", severity: "warning", field: "domain", message: "The From domain is not fully authenticated yet" });
  if (input.contents.length === 0) issues.push({ code: "content_missing", severity: "error", field: "body", message: "Select a template, add a sequence step, or create an A/B variant" });

  for (const content of input.contents) {
    const subject = content.subject.trim();
    const body = content.body.trim();
    if (!subject) issues.push({ code: "subject_missing", severity: "error", field: "subject", source: content.source, message: "Subject is required" });
    if (!body) issues.push({ code: "body_missing", severity: "error", field: "body", source: content.source, message: "Email body is required" });
    if (subject.length > 120) issues.push({ code: "subject_long", severity: "warning", field: "subject", source: content.source, message: "Subject is longer than 120 characters and may be truncated" });
    if (body && /<\/?[a-z][\s\S]*>/i.test(body) && body.replace(/<[^>]*>/g, "").trim().length < 20) issues.push({ code: "text_version_missing", severity: "error", field: "body", source: content.source, message: "HTML content has no meaningful text version" });
    if (/<script\b|\son\w+\s*=|javascript:/i.test(body)) issues.push({ code: "unsafe_html", severity: "error", field: "body", source: content.source, message: "Unsafe HTML or script content is not allowed in email" });
    if (/<img\b/i.test(body) && !/alt\s*=/i.test(body)) issues.push({ code: "image_alt_missing", severity: "warning", field: "body", source: content.source, message: "Images should include alt text for accessibility" });
    const unresolved = [...`${subject}\n${body}`.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map((match) => match[1].trim()).filter((name) => !/^[A-Za-z0-9_.]+$/.test(name));
    if (unresolved.length) issues.push({ code: "invalid_merge_tag", severity: "error", field: "body", source: content.source, message: `Invalid template variable: {{${unresolved[0]}}}` });
    for (const [pattern, message] of SPAM_PATTERNS) {
      if (pattern.test(`${subject}\n${body}`)) issues.push({ code: "spam_trigger", severity: "warning", field: "body", source: content.source, message });
    }
    if ((subject.match(/[!?]/g) ?? []).length >= 4 || /[A-ZА-Я]{10,}/.test(subject)) issues.push({ code: "subject_spam_style", severity: "warning", field: "subject", source: content.source, message: "Excessive punctuation or uppercase in subject may hurt deliverability" });
    if (!/unsubscribe|отпис/i.test(body)) issues.push({ code: "unsubscribe_injected", severity: "warning", field: "body", source: content.source, message: "Unsubscribe link is not in the draft; ClipReach will append a signed link when sending" });
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return { ready: errors === 0, errors, warnings: issues.length - errors, checkedAt: new Date().toISOString(), issues };
}

export function senderDomain(fromAddress: string | null): string | null {
  if (!fromAddress) return null;
  const address = fromAddress.match(/<([^>]+)>/)?.[1] ?? fromAddress;
  const domain = address.trim().toLowerCase().split("@")[1];
  return domain ? domainToASCII(domain) : null;
}

export async function checkLinks(links: string[], fetcher: typeof fetch = fetch): Promise<PreflightIssue[]> {
  const issues: Array<PreflightIssue | null> = await Promise.all(links.slice(0, 25).map(async (url): Promise<PreflightIssue | null> => {
    try {
      let response = await fetcher(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5_000) });
      if (response.status === 405 || response.status === 501) response = await fetcher(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5_000), headers: { range: "bytes=0-0" } });
      return response.ok ? null : { code: "broken_link", severity: "warning" as const, field: "links" as const, message: `Link returned HTTP ${response.status}: ${url}` };
    } catch {
      return { code: "broken_link", severity: "warning" as const, field: "links" as const, message: `Link is unreachable: ${url}` };
    }
  }));
  return issues.filter((issue): issue is PreflightIssue => issue !== null);
}
