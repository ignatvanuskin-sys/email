// Typed, validated access to environment variables with safe development defaults.

const isProduction = process.env.NODE_ENV === "production";

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me",
  CREDENTIALS_KEY: process.env.CREDENTIALS_KEY ?? null,
  MOCK_AI: envBool("MOCK_AI", process.env.NODE_ENV === "test"),
  MOCK_EMAIL: envBool("MOCK_EMAIL", process.env.NODE_ENV === "test"),
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? (isProduction ? "" : "insecure-dev-webhook-secret"),
  CRON_SECRET: process.env.CRON_SECRET ?? (isProduction ? "" : "insecure-dev-cron-secret"),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? null,
  AI_MODEL: process.env.AI_MODEL ?? "claude-3-5-haiku-latest",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID ?? null,
  SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET ?? null,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? null,
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO ?? null,
  STRIPE_PRICE_AGENCY: process.env.STRIPE_PRICE_AGENCY ?? null,
  ENABLE_TELEGRAM: envBool("ENABLE_TELEGRAM", true),
  ENABLE_SHOPIFY: envBool("ENABLE_SHOPIFY", true),
  ENABLE_ADVANCED_JOURNEYS: envBool("ENABLE_ADVANCED_JOURNEYS", true),
  ENABLE_BILLING: envBool("ENABLE_BILLING", true),
  ENABLE_HTML_BUILDER: envBool("ENABLE_HTML_BUILDER", true),
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET ?? null,
  BOUNCE_WEBHOOK_SECRET: process.env.BOUNCE_WEBHOOK_SECRET ?? (isProduction ? null : "local-bounce-webhook-secret-change-me"),
  UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET ?? (isProduction ? null : "local-unsubscribe-secret-change-me"),
} as const;

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function isStrongSecret(value: string | null | undefined): value is string {
  return Boolean(value && value.length >= 32);
}

export function productionConfigIssues(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (!isStrongSecret(process.env.SESSION_SECRET)) issues.push("SESSION_SECRET must be a strong 32+ character value");
  if (!isStrongSecret(process.env.WEBHOOK_SECRET)) issues.push("WEBHOOK_SECRET must be a strong 32+ character value");
  if (!isStrongSecret(process.env.CRON_SECRET)) issues.push("CRON_SECRET must be a strong 32+ character value");
  if (!isStrongSecret(process.env.BOUNCE_WEBHOOK_SECRET)) issues.push("BOUNCE_WEBHOOK_SECRET must be a strong 32+ character value");
  if (!isStrongSecret(process.env.UNSUBSCRIBE_SECRET)) issues.push("UNSUBSCRIBE_SECRET must be a strong 32+ character value");
  if (!process.env.CREDENTIALS_KEY) issues.push("CREDENTIALS_KEY must be configured");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(process.env.CREDENTIALS_KEY)) issues.push("CREDENTIALS_KEY must be valid base64");
  else if (Buffer.from(process.env.CREDENTIALS_KEY, "base64").length !== 32) issues.push("CREDENTIALS_KEY must decode to exactly 32 bytes");
  if (!/^https:\/\//i.test(process.env.APP_URL ?? "")) issues.push("APP_URL must be an HTTPS origin");
  if (env.ENABLE_TELEGRAM && !isStrongSecret(process.env.TELEGRAM_WEBHOOK_SECRET)) issues.push("TELEGRAM_WEBHOOK_SECRET is required when Telegram is enabled");
  if (env.ENABLE_BILLING && !process.env.STRIPE_WEBHOOK_SECRET) issues.push("STRIPE_WEBHOOK_SECRET is required when billing is enabled");
  return issues;
}

export function assertSecureRuntimeConfig(): void {
  const issues = productionConfigIssues();
  if (issues.length) throw new Error("Secure production runtime configuration is incomplete");
}
