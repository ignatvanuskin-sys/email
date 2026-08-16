import { z } from "zod";
import { getApiUser, handleError, ok, readJson, unauthorized } from "@/lib/api";
import { applyTemplate } from "@/lib/emailSender";
import { renderEmailHtml } from "@/lib/emailHtml";

const schema = z.object({
  subject: z.string().max(500),
  body: z.string().max(50000),
  documentJson: z.string().max(200000).optional().nullable(),
  device: z.enum(["desktop", "mobile"]).default("desktop"),
  mode: z.enum(["light", "dark"]).default("light"),
  client: z.enum(["gmail", "outlook", "apple", "generic"]).default("generic"),
});

const CLIENT_PRESETS: Record<string, { name: string; note: string; maxWidth: number; fontSize: number }> = {
  gmail: { name: "Gmail", note: "Truncates messages after ~102KB; supports limited CSS.", maxWidth: 600, fontSize: 15 },
  outlook: { name: "Outlook", note: "Ignores flex/grid and many modern CSS rules.", maxWidth: 620, fontSize: 15 },
  apple: { name: "Apple Mail", note: "Best CSS support; honors @media and dark mode.", maxWidth: 600, fontSize: 16 },
  generic: { name: "Generic", note: "Baseline safe rendering.", maxWidth: 600, fontSize: 16 },
};

export async function POST(req: Request) {
  try {
    const user = await getApiUser();
    if (!user) return unauthorized();
    const data = schema.parse(await readJson(req));
    const vars = { firstName: "Alex", lastName: "Rivera", company: "Example Studio", email: user.email, website: "https://example.com", channel: "Example Channel", niche: "SaaS" };
    const rendered = renderEmailHtml(data.documentJson || applyTemplate(data.body, vars), vars);
    const preset = CLIENT_PRESETS[data.client];
    const darkOverride = data.mode === "dark"
      ? rendered.html.replace("background:#f5f7fb", "background:#0f1420").replace("color:#172033", "color:#e6e9f2").replace('background:#fff', 'background:#151b2a')
      : rendered.html;
    return ok({
      subject: applyTemplate(data.subject, vars),
      text: rendered.text,
      html: darkOverride,
      device: data.device,
      mode: data.mode,
      client: data.client,
      clientName: preset.name,
      clientNote: preset.note,
      viewport: data.device === "mobile" ? { width: 390, height: 844 } : { width: preset.maxWidth, height: 900 },
    });
  } catch (error) { return handleError(error); }
}
