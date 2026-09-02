import { isIP } from "node:net";
import nodemailer from "nodemailer";
import { getApiUser, apiError, badRequest, ok, readJson, unauthorized } from "@/lib/api";
import { decryptCredentials } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { smtpConfigSchema } from "@/lib/validation";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const user = await getApiUser();
  if (!user) return unauthorized();
  if (env.MOCK_EMAIL) return apiError("Real SMTP verification is disabled while mock email mode is enabled", 503, "REAL_SMTP_REQUIRED");

  try {
    const input = await readJson(req);
    const supplied = input && typeof input === "object" ? input as Record<string, unknown> : {};
    let config: Record<string, unknown> = supplied;
    if (!supplied.host || !supplied.user || !supplied.pass) {
      const provider = await prisma.provider.findFirst({ where: { userId: user.id, kind: "email", isActive: true }, orderBy: { createdAt: "desc" } });
      if (!provider) return badRequest("SMTP provider is not configured");
      try {
        config = { ...JSON.parse(decryptCredentials(provider.configEncrypted)) as Record<string, unknown>, ...supplied };
      } catch {
        return apiError("SMTP provider credentials are unreadable", 422, "SMTP_CONFIG_INVALID");
      }
    }

    const smtp = smtpConfigSchema.parse(config);
    if (isUnsafeHost(smtp.host)) return apiError("SMTP host is not allowed", 400, "SMTP_HOST_NOT_ALLOWED");
    const diagnostics = { providerSelected: "smtp" as const, mockEmail: false, host: smtp.host, port: smtp.port, secure: smtp.secure, transportCreated: false, connectionVerified: false, authenticated: false };
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    diagnostics.transportCreated = true;
    try {
      await transport.verify();
      diagnostics.connectionVerified = true;
      diagnostics.authenticated = true;
      return ok({ ok: true, diagnostics });
    } catch (error) {
      console.warn("[smtp-verify-failed]", { userId: user.id, host: smtp.host, port: smtp.port, error });
      return apiError("SMTP verification failed", 502, "SMTP_VERIFY_FAILED");
    } finally {
      transport.close();
    }
  } catch (error) {
    console.error("[smtp-config-error]", { userId: user.id, error });
    return apiError("Invalid SMTP configuration", 400, "SMTP_CONFIG_INVALID");
  }
}

function isUnsafeHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/[\[\]]/g, "");
  if (["localhost", "localhost.localdomain", "ip6-localhost"].includes(normalized) || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = normalized.split(".").map(Number);
    return octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  }
  if (ipVersion === 6) return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  return false;
}
