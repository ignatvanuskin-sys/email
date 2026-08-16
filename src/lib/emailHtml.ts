import { applyTemplate, type TemplateVars } from "./emailSender";
import { documentToHtml, parseEmailDocument, renderDocumentText } from "./emailBuilder";

export type RenderedEmail = { text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(value: string): string | null {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}

function linkify(text: string, trackingUrl?: (url: string, index: number) => string): string {
  const pattern = /(https?:\/\/[^\s<]+)/gi;
  let index = 0;
  return text.split(pattern).map((part, partIndex) => {
    if (partIndex % 2 === 0) return escapeHtml(part);
    const url = safeUrl(part.replace(/[.,;!?]+$/, ""));
    if (!url) return escapeHtml(part);
    const target = trackingUrl ? trackingUrl(url, index++) : url;
    return `<a href="${escapeHtml(target)}" style="color:#2563eb;text-decoration:underline">${escapeHtml(part)}</a>`;
  }).join("");
}

export function renderEmailHtml(body: string, vars: TemplateVars, options?: { trackingUrl?: (url: string, index: number) => string; pixelUrl?: string }): RenderedEmail {
  const document = parseEmailDocument(body);
  if (document) {
    const text = renderDocumentText(document, vars);
    const htmlBody = documentToHtml(document, vars, options?.trackingUrl);
    const pixel = options?.pixelUrl ? `<img src="${escapeHtml(options.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />` : "";
    return { text, html: `<!doctype html><html><body style="margin:0;background:#f5f7fb">${htmlBody}${pixel}</body></html>` };
  }
  const text = applyTemplate(body, vars).replace(/\n\n+/g, "\n\n").trim();
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 16px">${linkify(paragraph, options?.trackingUrl).replace(/\n/g, "<br />")}</p>`).join("");
  const pixel = options?.pixelUrl ? `<img src="${escapeHtml(options.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;color:#172033;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px;background:#fff;font-size:16px;line-height:1.55">${paragraphs}${pixel}</div></body></html>`;
  return { text, html };
}

export function rewriteHtmlLinks(html: string, rewrite: (url: string, index: number) => string): string {
  let index = 0;
  return html.replace(/(href\s*=\s*["'])(https?:\/\/[^"']+)(["'])/gi, (_whole, prefix: string, url: string, suffix: string) => `${prefix}${escapeHtml(rewrite(url, index++))}${suffix}`);
}
