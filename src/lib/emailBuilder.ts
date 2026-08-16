import type { TemplateVars } from "./emailSender";

export type EmailBlock =
  | { id: string; type: "text"; text: string; align?: "left" | "center" | "right" }
  | { id: string; type: "heading"; text: string; level?: 1 | 2 | 3; align?: "left" | "center" | "right" }
  | { id: string; type: "button"; text: string; url: string; align?: "left" | "center" | "right" }
  | { id: string; type: "image"; url: string; alt?: string; width?: number }
  | { id: string; type: "divider" };

export type EmailDocument = { version: 1; blocks: EmailBlock[]; styles?: { background?: string; textColor?: string; accentColor?: string; maxWidth?: number } };

export function isEmailDocument(value: unknown): value is EmailDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<EmailDocument>;
  return document.version === 1 && Array.isArray(document.blocks) && document.blocks.every((block) => Boolean(block && typeof block === "object" && typeof (block as EmailBlock).id === "string" && typeof (block as EmailBlock).type === "string"));
}

export function parseEmailDocument(raw: string | null | undefined): EmailDocument | null {
  if (!raw) return null;
  try { const value = JSON.parse(raw) as unknown; return isEmailDocument(value) ? value : null; } catch { return null; }
}

export function renderDocumentText(document: EmailDocument, vars: TemplateVars): string {
  return document.blocks.map((block) => {
    if (block.type === "divider") return "---";
    if (block.type === "button") return `${replaceVars(block.text, vars)}: ${block.url}`;
    if (block.type === "image") return block.alt ? `[${replaceVars(block.alt, vars)}]` : "";
    return replaceVars(block.text, vars);
  }).filter(Boolean).join("\n\n");
}

function replaceVars(text: string, vars: TemplateVars): string { return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_all, key) => vars[key] == null ? "" : String(vars[key])); }

export function documentToHtml(document: EmailDocument, vars: TemplateVars, trackingUrl?: (url: string, index: number) => string): string {
  let linkIndex = 0;
  const styles = document.styles ?? {};
  const blocks = document.blocks.map((block) => {
    const align = "align" in block && block.align ? block.align : "left";
    if (block.type === "text") return `<p style="margin:0 0 16px;text-align:${align}">${escapeHtml(replaceVars(block.text, vars)).replace(/\n/g, "<br />")}</p>`;
    if (block.type === "heading") { const tag = block.level === 1 ? "h1" : block.level === 3 ? "h3" : "h2"; return `<${tag} style="text-align:${align};margin:0 0 16px">${escapeHtml(replaceVars(block.text, vars))}</${tag}>`; }
    if (block.type === "button") { const url = trackingUrl ? trackingUrl(block.url, linkIndex++) : block.url; return `<p style="text-align:${align}"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:${escapeHtml(styles.accentColor ?? "#2563eb")};color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(replaceVars(block.text, vars))}</a></p>`; }
    if (block.type === "image") return `<p style="margin:0 0 16px;text-align:${align}"><img src="${escapeHtml(block.url)}" alt="${escapeHtml(replaceVars(block.alt ?? "", vars))}" style="max-width:100%;width:${Math.min(block.width ?? 600, 600)}px;height:auto" /></p>`;
    return `<hr style="border:0;border-top:1px solid #d9dee8;margin:20px 0" />`;
  }).join("");
  return `<div style="max-width:${Math.min(styles.maxWidth ?? 600, 700)}px;margin:0 auto;padding:32px 20px;background:${escapeHtml(styles.background ?? "#ffffff")};color:${escapeHtml(styles.textColor ?? "#172033")};font-family:Arial,sans-serif;line-height:1.55">${blocks}</div>`;
}

function escapeHtml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
