const { spawn } = require("node:child_process");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

run("./node_modules/.bin/prisma", ["db", "push", "--schema", "prisma/schema.postgres.prisma", "--accept-data-loss"])
  .then(() => run("node", ["server.js"]))
  .catch((error) => { console.error(error); process.exit(1); });
