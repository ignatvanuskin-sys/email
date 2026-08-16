import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) { console.error("DATABASE_URL must be PostgreSQL for production backup"); process.exit(1); }
const dir = process.env.BACKUP_DIR ?? "backups";
mkdirSync(dir, { recursive: true });
const file = `${dir}/clipreach-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const child = spawn("pg_dump", ["--format=custom", "--file", file, url], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
