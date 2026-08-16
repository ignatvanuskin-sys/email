import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { decryptCredentials } from "./crypto";
import { env } from "./env";
import type { EmailProviderType } from "./status";
import { renderContent } from "./dynamicContent";

// ---------------------------------------------------------------------------
// Provider-agnostic email sending (spec §17): single `sendEmail` interface
// abstracting SMTP / Gmail OAuth / Mock. Credentials are decrypted at send time.
// ---------------------------------------------------------------------------

export type OutboundMessage = {
  to: string;
  subject: string;
  body: string;
  html?: string;
};

export type SmtpDiagnostics = {
  providerSelected: "smtp" | "mock";
  mockEmail: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  transportCreated?: boolean;
  connectionVerified?: boolean;
  authenticated?: boolean;
  acceptedCount?: number;
  rejectedCount?: number;
  messageIdPresent?: boolean;
};

export type SendResult =
  | { ok: true; providerMessageId: string; acceptedCount: number; rejectedCount: number; diagnostics: SmtpDiagnostics }
  | { ok: false; error: string; diagnostics?: SmtpDiagnostics };

export async function sendEmail(
  userId: string,
  message: OutboundMessage,
): Promise<SendResult> {
  if (env.MOCK_EMAIL) {
    // Mock mode is explicit and never represents a real provider acceptance.
    await new Promise((r) => setTimeout(r, 50));
    return {
      ok: true,
      providerMessageId: `mock-${Date.now()}`,
      acceptedCount: 1,
      rejectedCount: 0,
      diagnostics: { providerSelected: "mock", mockEmail: true, acceptedCount: 1, rejectedCount: 0, messageIdPresent: true },
    };
  }

  const provider = await prisma.provider.findFirst({
    where: { userId, kind: "email", isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!provider) return { ok: false, error: "Email provider not connected" };

  let config: {
    type?: EmailProviderType;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
  };
  try {
    config = JSON.parse(decryptCredentials(provider.configEncrypted));
  } catch {
    return { ok: false, error: "Email provider credentials are unreadable" };
  }

  if (config.type === "Mock") {
    return { ok: false, error: "Mock email provider is disabled for real sends", diagnostics: { providerSelected: "mock", mockEmail: false } };
  }

  // SMTP (Gmail App Password uses STARTTLS on port 587).
  const port = config.port ?? 465;
  const secure = config.secure ?? port === 465;
  const diagnostics: SmtpDiagnostics = {
    providerSelected: "smtp",
    mockEmail: false,
    host: config.host,
    port,
    secure,
  };

  if (!config.host || !config.user || !config.pass) {
    return { ok: false, error: "SMTP provider is missing host or credentials", diagnostics };
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });
  diagnostics.transportCreated = true;

  try {
    // Verify performs DNS/TCP, TLS negotiation and SMTP authentication before send.
    await transport.verify();
    diagnostics.connectionVerified = true;
    diagnostics.authenticated = true;

    const info = await transport.sendMail({
      from: config.from || config.user,
      to: message.to,
      subject: message.subject,
      text: message.body.replace(/\n\n+/g, "\n\n"),
      ...(message.html ? { html: message.html } : {}),
    });
    const acceptedCount = Array.isArray(info.accepted) ? info.accepted.length : 0;
    const rejectedCount = Array.isArray(info.rejected) ? info.rejected.length : 0;
    const providerMessageId = String(info.messageId ?? "");
    diagnostics.acceptedCount = acceptedCount;
    diagnostics.rejectedCount = rejectedCount;
    diagnostics.messageIdPresent = providerMessageId.length > 0;

    if (!providerMessageId || acceptedCount < 1 || rejectedCount > 0) {
      return { ok: false, error: "SMTP server did not accept the recipient", diagnostics };
    }
    return { ok: true, providerMessageId, acceptedCount, rejectedCount, diagnostics };
  } catch (err) {
    // Nodemailer errors may contain provider detail, but never include config values.
    const error = err instanceof Error ? err.message.replace(/(pass(word)?|auth(?:entication)?)[^;\n]*/gi, "$1 failed") : "SMTP send failed";
    return { ok: false, error, diagnostics };
  } finally {
    transport.close();
  }
}

// ---------------------------------------------------------------------------
// Template variable substitution (spec §13.4 / §16).
// ---------------------------------------------------------------------------

export type TemplateVars = Record<string, string | number | null | undefined>;

export function applyTemplate(
  text: string,
  vars: TemplateVars,
): string {
  return renderContent(text, vars).replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_whole, key) => {
    const value = vars[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

export function templateVariables(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)) set.add(m[1]);
  return Array.from(set);
}
