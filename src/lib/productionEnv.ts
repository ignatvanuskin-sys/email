import { env } from "./env";

export function productionEnvIssues(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const issues: string[] = [];
  if (env.SESSION_SECRET === "insecure-dev-secret-change-me" || env.SESSION_SECRET.length < 32) issues.push("SESSION_SECRET must be a strong 32+ character value");
  if (!env.CREDENTIALS_KEY) issues.push("CREDENTIALS_KEY must be configured");
  if (!env.WEBHOOK_SECRET || env.WEBHOOK_SECRET.length < 32) issues.push("WEBHOOK_SECRET must be configured");
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) issues.push("CRON_SECRET must be configured");
  if (env.APP_URL.startsWith("http://localhost")) issues.push("APP_URL must point to the production HTTPS origin");
  return issues;
}
