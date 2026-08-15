// Centralized, typed environment access. Development defaults are deliberately
// retained for local work, but production runtime operations fail closed when
// security-sensitive values are missing or weak.

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? (isProduction ? "" : "file:./dev.db"),
  SESSION_SECRET: process.env.SESSION_SECRET ?? (isProduction ? "" : "local-development-secret-change-me"),
  // Base64-encoded 32-byte key used to encrypt provider credentials at rest.
  CREDENTIALS_KEY: process.env.CREDENTIALS_KEY ?? null,
  MOCK_AI: envBool("MOCK_AI", process.env.NODE_ENV === "test"),
  MOCK_EMAIL: envBool("MOCK_EMAIL", process.env.NODE_ENV === "test"),
  APP_URL: process.env.APP_URL ?? (isProduction ? "" : "http://localhost:3000"),
  BOUNCE_WEBHOOK_SECRET: process.env.BOUNCE_WEBHOOK_SECRET ?? (isProduction ? null : "local-bounce-webhook-secret-change-me"),
  UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET ?? (isProduction ? null : "local-unsubscribe-secret-change-me"),
  // Optional real AI provider credentials (only used when MOCK_AI=false).
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? null,
  AI_MODEL: process.env.AI_MODEL ?? "claude-3-5-haiku-latest",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
} as const;

export function assertSecureRuntimeConfig(): void {
  if (!isProduction) return;
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be configured in production");
  if (env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters in production");
  if (!env.CREDENTIALS_KEY) throw new Error("CREDENTIALS_KEY must be configured in production");
  if (!env.BOUNCE_WEBHOOK_SECRET || env.BOUNCE_WEBHOOK_SECRET.length < 32) throw new Error("BOUNCE_WEBHOOK_SECRET must contain at least 32 characters in production");
  if (!env.UNSUBSCRIBE_SECRET || env.UNSUBSCRIBE_SECRET.length < 32) throw new Error("UNSUBSCRIBE_SECRET must contain at least 32 characters in production");
  if (!env.APP_URL.startsWith("https://")) throw new Error("APP_URL must use HTTPS in production");

  const key = Buffer.from(env.CREDENTIALS_KEY, "base64");
  if (key.length !== 32) throw new Error("CREDENTIALS_KEY must be base64-encoded 32 bytes in production");
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}
