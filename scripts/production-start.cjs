const { spawn } = require("node:child_process");

function productionEnvIssues() {
  if (process.env.NODE_ENV !== "production") return [];
  const issues = [];
  const strong = (name) => {
    const value = process.env[name];
    if (!value || value.length < 32) issues.push(`${name} must be a strong 32+ character value`);
  };
  strong("SESSION_SECRET");
  strong("WEBHOOK_SECRET");
  strong("CRON_SECRET");
  strong("BOUNCE_WEBHOOK_SECRET");
  strong("UNSUBSCRIBE_SECRET");
  if (!process.env.CREDENTIALS_KEY) issues.push("CREDENTIALS_KEY must be configured");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(process.env.CREDENTIALS_KEY)) issues.push("CREDENTIALS_KEY must be valid base64");
  else if (Buffer.from(process.env.CREDENTIALS_KEY, "base64").length !== 32) issues.push("CREDENTIALS_KEY must decode to exactly 32 bytes");
  if (!/^https:\/\//i.test(process.env.APP_URL || "")) issues.push("APP_URL must be an HTTPS origin");
  if (!/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || "")) issues.push("DATABASE_URL must use PostgreSQL in production");
  if (process.env.ENABLE_TELEGRAM !== "false" && process.env.ENABLE_TELEGRAM !== "0") strong("TELEGRAM_WEBHOOK_SECRET");
  if (process.env.ENABLE_BILLING !== "false" && process.env.ENABLE_BILLING !== "0" && !process.env.STRIPE_WEBHOOK_SECRET) issues.push("STRIPE_WEBHOOK_SECRET is required when billing is enabled");
  return issues;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  const issues = productionEnvIssues();
  if (issues.length) {
    console.error("Production configuration is invalid:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  if (process.env.PRISMA_MIGRATE_DEPLOY !== "true") {
    console.error("Refusing to start production without PRISMA_MIGRATE_DEPLOY=true; configure and apply committed PostgreSQL migrations.");
    process.exitCode = 1;
    return;
  }
  await run("./node_modules/.bin/prisma", ["migrate", "deploy", "--schema", "prisma/schema.postgres.prisma"]);
  await run("node", ["server.js"]);
}

main().catch((error) => { console.error("Production startup failed", error); process.exit(1); });
