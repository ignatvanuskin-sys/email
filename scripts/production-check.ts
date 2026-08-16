import { productionEnvIssues } from "../src/lib/productionEnv";
import { env } from "../src/lib/env";

const issues = productionEnvIssues();
const checks = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  database: env.DATABASE_URL.startsWith("postgresql://") || env.DATABASE_URL.startsWith("postgres://") ? "postgresql" : "sqlite",
  mockEmail: env.MOCK_EMAIL,
  mockAi: env.MOCK_AI,
  issues,
};
console.log(JSON.stringify(checks, null, 2));
if (process.env.NODE_ENV === "production" && issues.length) process.exit(1);
