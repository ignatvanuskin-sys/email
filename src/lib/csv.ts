import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { inspectEmail, normalizeEmailAddress } from "./emailHygiene";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5_000;
export const LEAD_IMPORT_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "name", label: "Name", required: false },
  { key: "companyOrChannel", label: "Company", required: false },
  { key: "websiteUrl", label: "Website", required: false },
  { key: "youtubeUrl", label: "YouTube", required: false },
  { key: "niche", label: "Niche", required: false },
  { key: "followersCount", label: "Followers", required: false },
] as const;

export type ImportMapping = Record<string, string>;
export type ImportRow = Record<string, string>;
export type ImportPreviewRow = {
  index: number;
  values: Record<string, string>;
  email?: string;
  state: "valid" | "invalid" | "duplicate";
  isValid: boolean;
  duplicate: boolean;
  reasons: string[];
  disposable: boolean;
  roleBased: boolean;
};

export function parseCsv(text: string): ImportRow[] {
  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) throw new Error("File exceeds the 5 MB import limit");
  const delimiter = detectDelimiter(text.replace(/^\uFEFF/, ""));
  const records = parse(text, { columns: true, delimiter, bom: true, skip_empty_lines: true, trim: true, relax_column_count: false }) as unknown[];
  return normalizeRows(records);
}

function detectDelimiter(text: string): "," | ";" {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted && ch === ",") commas++;
    else if (!quoted && ch === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseXlsx(buffer: Buffer): ImportRow[] {
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw new Error("File exceeds the 5 MB import limit");
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false, cellText: true, dense: true });
  const first = workbook.SheetNames[0];
  if (!first) throw new Error("Workbook has no sheets");
  const records = XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: "", raw: false }) as unknown[];
  return normalizeRows(records);
}

function normalizeRows(records: unknown[]): ImportRow[] {
  if (records.length > MAX_IMPORT_ROWS) throw new Error(`Import is limited to ${MAX_IMPORT_ROWS} rows`);
  return records.map((record) => Object.fromEntries(Object.entries(record as Record<string, unknown>).map(([key, value]) => [key.trim(), sanitizeCell(value)])));
}

export function sanitizeCell(value: unknown): string {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, 2_000);
}

// Detect spreadsheet-formula / CSV-injection prefixes so a crafted cell can
// never be persisted as executable content (spec §7, §33).
export function hasFormulaInjection(value: string): boolean {
  return /^[=+@]/.test(value) || /^-\D/.test(value);
}

export function normalizeEmail(value: string): string {
  return normalizeEmailAddress(value);
}

export function isValidEmail(value: string): boolean {
  return inspectEmail(value).valid;
}

const ALIASES: Record<string, string[]> = {
  email: ["email", "email_address", "emailaddress", "e-mail", "mail"],
  name: ["name", "full_name", "fullname", "contact_name"],
  companyOrChannel: ["company", "company_name", "companyorchannel", "channel", "organization"],
  websiteUrl: ["website", "website_url", "url"],
  youtubeUrl: ["youtube", "youtube_url", "channel_url"],
  niche: ["niche", "industry"],
  followersCount: ["followers", "followers_count", "audience"],
};

export function autoMapColumns(headers: string[]): ImportMapping {
  const normalized = new Map(headers.map((header) => [header.toLowerCase().replace(/[\s-]+/g, "_"), header]));
  return Object.fromEntries(Object.entries(ALIASES).flatMap(([target, aliases]) => {
    const header = aliases.map((alias) => normalized.get(alias)).find(Boolean);
    return header ? [[target, header]] : [];
  }));
}

export function mapAndValidateRows(records: ImportRow[], mapping: ImportMapping, existingEmails: Set<string>, suppressedEmails: Set<string> = new Set()): ImportPreviewRow[] {
  const seen = new Set<string>();
  return records.map((record, index) => {
    const values: Record<string, string> = {};
    for (const field of LEAD_IMPORT_FIELDS) values[field.key] = mapping[field.key] && record[mapping[field.key]] != null ? sanitizeCell(record[mapping[field.key]] ?? "") : "";
    const email = normalizeEmail(values.email ?? "");
    const hygiene = inspectEmail(email);
    values.email = email;
    const reasons: string[] = [];
    const badEmail = !email || !hygiene.valid;
    if (!email) reasons.push("Email is required");
    else if (!isValidEmail(email)) reasons.push("Invalid email");
    const duplicate = Boolean(email && (existingEmails.has(email) || seen.has(email)));
    if (duplicate) reasons.push(existingEmails.has(email) ? "Duplicate (already in workspace)" : "Duplicate (in file)");
    if (email) seen.add(email);
    const suppressed = Boolean(email && suppressedEmails.has(email));
    if (suppressed) reasons.push("Email is suppressed");
    if (hygiene.disposable) reasons.push("Disposable email provider");
    if (hygiene.roleBased) reasons.push("Role-based address");
    // Name is desirable but never blocks import (spec: name is optional on the Lead).
    if (!values.name) reasons.push("Missing name");
    // Reject any spreadsheet-formula / CSV-injection payload on any mapped field.
    const injected = LEAD_IMPORT_FIELDS.some((field) => mapping[field.key] && hasFormulaInjection(values[field.key]));
    if (injected) reasons.push("Potential CSV formula injection");

    const state = injected || badEmail || suppressed || hygiene.disposable ? "invalid" : duplicate ? "duplicate" : "valid";
    return { index, values, email: email || undefined, state, isValid: state === "valid", duplicate, reasons, disposable: hygiene.disposable, roleBased: hygiene.roleBased };
  });
}

export function validateGoogleSheetUrl(input: string): { id: string; gid?: string } {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw new Error("Enter a valid Google Sheets URL");
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Enter a valid Google Sheets URL");
  return { id: match[1], gid: url.searchParams.get("gid") ?? undefined };
}

export function googleSheetCsvUrl(input: string): string {
  const { id, gid } = validateGoogleSheetUrl(input);
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ""}`;
}

// Compatibility exports for the existing tests/API.
export const LEAD_CSV_FIELDS = LEAD_IMPORT_FIELDS;
export function validateLeadRow(raw: Record<string, string>, existing: Set<string>): ImportPreviewRow & { raw: Record<string, string> } {
  const row = mapAndValidateRows([raw], Object.fromEntries(Object.keys(raw).map((key) => [key, key])), existing)[0];
  return { ...row, raw: row.values };
}
