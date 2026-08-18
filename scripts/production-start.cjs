const { spawn } = require("node:child_process");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

const schema = "prisma/schema.postgres.prisma";
const useMigrations = process.env.PRISMA_MIGRATE_DEPLOY === "true";
const prismaArgs = useMigrations
  ? ["migrate", "deploy", "--schema", schema]
  : ["db", "push", "--schema", schema, "--accept-data-loss"];

run("./node_modules/.bin/prisma", prismaArgs)
  .then(() => run("node", ["server.js"]))
  .catch((error) => { console.error(error); process.exit(1); });
