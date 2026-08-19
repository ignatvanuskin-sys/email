import { spawn } from "node:child_process";
import { productionEnvIssues } from "../src/lib/productionEnv";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  const issues = productionEnvIssues();
  if (issues.length) throw new Error(`Production configuration is invalid: ${issues.join("; ")}`);
  if (process.env.PRISMA_MIGRATE_DEPLOY !== "true") throw new Error("Refusing to start production without PRISMA_MIGRATE_DEPLOY=true");
  await run("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.postgres.prisma"]);
  await run("node", ["server.js"]);
}

void main().catch((error) => { console.error(error); process.exit(1); });
