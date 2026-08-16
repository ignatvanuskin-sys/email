export type CompatibilityIssue = { code: string; severity: "error" | "warning"; client: string; message: string };

export function checkEmailCompatibility(html: string): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  if (/<script\b|javascript:/i.test(html)) issues.push({ code: "script", severity: "error", client: "All clients", message: "Scripts are not supported in email and are unsafe" });
  if (/<video\b|<canvas\b/i.test(html)) issues.push({ code: "unsupported_media", severity: "warning", client: "Outlook/Gmail", message: "Video or canvas may not render consistently" });
  if (/<style\b[^>]*>[^<]*@media/i.test(html) === false && /max-width|width:100%/i.test(html)) issues.push({ code: "responsive_css", severity: "warning", client: "Mobile clients", message: "Responsive layout has no detected media query; verify on narrow screens" });
  if (/position\s*:\s*(fixed|absolute)|display\s*:\s*(grid|flex)/i.test(html)) issues.push({ code: "layout", severity: "warning", client: "Outlook", message: "Modern CSS layout properties may be ignored by Outlook" });
  if (/<img\b/i.test(html) && !/alt\s*=/i.test(html)) issues.push({ code: "alt", severity: "warning", client: "All clients", message: "Images should include alt text" });
  if (html.length > 90_000) issues.push({ code: "size", severity: "warning", client: "Gmail", message: "HTML is large and may be clipped by Gmail" });
  return issues;
}
