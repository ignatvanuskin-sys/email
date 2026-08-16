import { generateKeyPairSync } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { domainToASCII } from "node:url";

export const DNS_STATUS = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  MISSING: "Missing",
  INVALID: "Invalid",
  ERROR: "Error",
} as const;

export type DnsStatus = (typeof DNS_STATUS)[keyof typeof DNS_STATUS];

export type DomainVerification = {
  spfStatus: DnsStatus;
  dkimStatus: DnsStatus;
  dmarcStatus: DnsStatus;
  overallStatus: "Pending" | "Verified" | "NeedsAttention";
  spfValue: string | null;
  dmarcValue: string | null;
  lastError: string | null;
};

type TxtResolver = (hostname: string) => Promise<string[][]>;

export function normalizeDomain(input: string): string {
  const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/.]+$/, "");
  if (value.includes("/") || value.includes(":") || value.includes("@")) throw new Error("Enter a domain without protocol or path");
  const ascii = domainToASCII(value);
  if (!ascii || ascii.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(ascii)) {
    throw new Error("Enter a valid domain, for example example.com");
  }
  return ascii;
}

export function normalizeSelector(input: string): string {
  const value = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) throw new Error("DKIM selector may contain letters, numbers and hyphens");
  return value;
}

export function generateDkimKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export function dkimDnsValue(publicKey: string): string {
  const key = publicKey.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, "");
  return `v=DKIM1; k=rsa; p=${key}`;
}

export function domainDnsRecords(domain: string, selector: string, publicKey: string) {
  return {
    spf: { type: "TXT", host: domain, value: "v=spf1 include:_spf.google.com ~all" },
    dkim: { type: "TXT", host: `${selector}._domainkey.${domain}`, value: dkimDnsValue(publicKey) },
    dmarc: { type: "TXT", host: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` },
  } as const;
}

function flatten(records: string[][]): string[] {
  return records.map((parts) => parts.join(""));
}

async function safeResolve(hostname: string, resolver: TxtResolver): Promise<{ values: string[]; error?: string }> {
  try {
    return { values: flatten(await resolver(hostname)) };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (["ENODATA", "ENOTFOUND", "ENODOMAIN"].includes(code)) return { values: [] };
    return { values: [], error: error instanceof Error ? error.message : "DNS lookup failed" };
  }
}

export async function verifyDomainDns(
  domain: string,
  selector: string,
  publicKey: string,
  resolver: TxtResolver = resolveTxt,
): Promise<DomainVerification> {
  const [root, dkim, dmarc] = await Promise.all([
    safeResolve(domain, resolver),
    safeResolve(`${selector}._domainkey.${domain}`, resolver),
    safeResolve(`_dmarc.${domain}`, resolver),
  ]);
  const spfValues = root.values.filter((value) => /^v=spf1\b/i.test(value));
  const dkimValues = dkim.values.filter((value) => /^v=dkim1\b/i.test(value));
  const dmarcValues = dmarc.values.filter((value) => /^v=dmarc1\b/i.test(value));
  const expectedKey = dkimDnsValue(publicKey).replace(/\s+/g, "").toLowerCase();
  const dkimMatches = dkimValues.some((value) => value.replace(/\s+/g, "").toLowerCase() === expectedKey);
  const errors = [root.error, dkim.error, dmarc.error].filter(Boolean);

  const spfStatus: DnsStatus = root.error ? DNS_STATUS.ERROR : spfValues.length === 0 ? DNS_STATUS.MISSING : spfValues.length > 1 ? DNS_STATUS.INVALID : DNS_STATUS.VERIFIED;
  const dkimStatus: DnsStatus = dkim.error ? DNS_STATUS.ERROR : dkimValues.length === 0 ? DNS_STATUS.MISSING : dkimMatches ? DNS_STATUS.VERIFIED : DNS_STATUS.INVALID;
  const dmarcStatus: DnsStatus = dmarc.error ? DNS_STATUS.ERROR : dmarcValues.length === 0 ? DNS_STATUS.MISSING : DNS_STATUS.VERIFIED;
  const statuses = [spfStatus, dkimStatus, dmarcStatus];

  return {
    spfStatus,
    dkimStatus,
    dmarcStatus,
    overallStatus: statuses.every((status) => status === DNS_STATUS.VERIFIED) ? "Verified" : "NeedsAttention",
    spfValue: spfValues[0] ?? null,
    dmarcValue: dmarcValues[0] ?? null,
    lastError: errors.length ? errors.join("; ").slice(0, 1000) : null,
  };
}
