import { domainToASCII } from "node:url";

const ROLE_LOCAL_PARTS = new Set([
  "abuse", "admin", "billing", "compliance", "contact", "hello", "help", "info",
  "marketing", "noreply", "no-reply", "office", "privacy", "sales", "security",
  "support", "team", "webmaster",
]);

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "dispostable.com", "fakeinbox.com", "guerrillamail.com",
  "maildrop.cc", "mailinator.com", "sharklasers.com", "temp-mail.org",
  "tempmail.com", "throwawaymail.com", "yopmail.com",
]);

export type EmailHygieneResult = {
  normalized: string;
  valid: boolean;
  disposable: boolean;
  roleBased: boolean;
  quality: "Valid" | "Risky" | "Invalid";
  reasons: string[];
};

export function normalizeEmailAddress(input: string): string {
  return input.trim().toLowerCase();
}

export function inspectEmail(input: string): EmailHygieneResult {
  const normalized = normalizeEmailAddress(input);
  const at = normalized.lastIndexOf("@");
  const local = at > 0 ? normalized.slice(0, at) : "";
  const domain = at > 0 ? normalized.slice(at + 1) : "";
  const asciiDomain = domainToASCII(domain);
  const valid = normalized.length <= 320 && local.length > 0 && local.length <= 64 && asciiDomain.length > 3 && /^[^\s@]+$/.test(local) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(asciiDomain);
  const disposable = valid && DISPOSABLE_DOMAINS.has(asciiDomain);
  const roleBased = valid && ROLE_LOCAL_PARTS.has(local.replace(/\+.*/, ""));
  const reasons: string[] = [];
  if (!valid) reasons.push("Invalid email");
  if (disposable) reasons.push("Disposable email provider");
  if (roleBased) reasons.push("Role-based address");
  return { normalized, valid, disposable, roleBased, quality: !valid || disposable ? "Invalid" : roleBased ? "Risky" : "Valid", reasons };
}
