import { spawn } from "node:child_process";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  await run("npx", ["prisma", "db", "push", "--schema", "prisma/schema.postgres.prisma", "--accept-data-loss"]);
  await run("node", ["server.js"]);
}

void main();
