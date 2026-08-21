import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? "backups");
const ENCRYPTION_KEY = readKey();

if (!DATABASE_URL.startsWith("postgresql://") && !DATABASE_URL.startsWith("postgres://")) fail("DATABASE_URL must be PostgreSQL for production backup");
mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const tempDump = join(BACKUP_DIR, `.clipreach-${stamp}.dump.tmp`);
const encryptedFile = join(BACKUP_DIR, `clipreach-${stamp}.dump.enc`);
const checksumFile = `${encryptedFile}.sha256`;
const manifestFile = `${encryptedFile}.json`;

try {
  await run("pg_dump", ["--format=custom", "--file", tempDump, ...databaseArgs(DATABASE_URL)], { env: process.env });
  const plaintext = readFileSync(tempDump);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([Buffer.from("CLIPREACH-BACKUP-V1\n"), iv, tag, ciphertext]);
  writeFileSync(encryptedFile, envelope, { mode: 0o600, flag: "wx" });
  const checksum = createHash("sha256").update(envelope).digest("hex");
  writeFileSync(checksumFile, `${checksum}  ${encryptedFile.split("/").pop()}\n`, { mode: 0o600, flag: "wx" });
  writeFileSync(manifestFile, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), encryptedFile: encryptedFile.split("/").pop(), sha256: checksum, bytes: envelope.length }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  unlinkSync(tempDump);
  applyRetention();
  console.log(JSON.stringify({ ok: true, file: encryptedFile, sha256: checksum }));
} catch (error) {
  if (existsSync(tempDump)) unlinkSync(tempDump);
  console.error("Database backup failed", error);
  process.exitCode = 1;
}

function readKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) fail("BACKUP_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  return key;
}

function databaseArgs(value: string): string[] {
  const parsed = new URL(value);
  const args = ["--host", parsed.hostname, "--port", parsed.port || "5432", "--username", decodeURIComponent(parsed.username), "--dbname", `${parsed.pathname.slice(1)}${parsed.search}`];
  return args;
}

function run(command: string, args: string[], options: { env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: { ...options.env, PGPASSWORD: decodeURIComponent(new URL(DATABASE_URL).password) } });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code ?? "unknown"}`)));
  });
}

function applyRetention(): void {
  const days = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS ?? 30));
  const cutoff = Date.now() - days * 86400000;
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!name.endsWith(".dump.enc")) continue;
    const path = join(BACKUP_DIR, name);
    if (statSync(path).mtimeMs < cutoff) {
      for (const companion of [path, `${path}.sha256`, `${path}.json`]) if (existsSync(companion)) unlinkSync(companion);
    }
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
