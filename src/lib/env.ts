// Typed, validated access to environment variables with sensible defaults.
// Centralizes all process.env reads so that typos / missing values surface once.

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me",
  // base64-encoded 32-byte key used to encrypt provider credentials at rest.
  CREDENTIALS_KEY: process.env.CREDENTIALS_KEY ?? null,
  MOCK_AI: envBool("MOCK_AI", process.env.NODE_ENV === "test"),
  MOCK_EMAIL: envBool("MOCK_EMAIL", process.env.NODE_ENV === "test"),
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? process.env.SESSION_SECRET ?? "insecure-dev-webhook-secret",
  CRON_SECRET: process.env.CRON_SECRET ?? process.env.SESSION_SECRET ?? "insecure-dev-cron-secret",
  // Optional real AI provider credentials (only used when MOCK_AI=false).
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
} as const;

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}
