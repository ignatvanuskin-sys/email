import { spawn } from "node:child_process";
const url = process.env.DATABASE_URL ?? "";
const file = process.env.BACKUP_FILE ?? "";
if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) { console.error("DATABASE_URL must be PostgreSQL for production restore"); process.exit(1); }
if (!file) { console.error("BACKUP_FILE is required"); process.exit(1); }
if (process.env.CONFIRM_RESTORE !== "yes") { console.error("Set CONFIRM_RESTORE=yes to run a destructive restore"); process.exit(1); }
const child = spawn("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", url, file], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
