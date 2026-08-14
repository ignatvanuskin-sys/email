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
  // Optional real AI provider credentials (only used when MOCK_AI=false).
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? null,
  AI_MODEL: process.env.AI_MODEL ?? "claude-3-5-haiku-latest",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
} as const;

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}