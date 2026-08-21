import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const backupFile = resolve(process.env.BACKUP_FILE ?? "");
const encryptionKey = readKey();

if (!DATABASE_URL.startsWith("postgresql://") && !DATABASE_URL.startsWith("postgres://")) fail("DATABASE_URL must be PostgreSQL for production restore");
if (!backupFile || backupFile === "/" || !existsSync(backupFile)) fail("BACKUP_FILE must point to an existing encrypted backup");
if (!backupFile.endsWith(".dump.enc")) fail("BACKUP_FILE must be a .dump.enc artifact created by db-backup");
if (process.env.ALLOW_DESTRUCTIVE_RESTORE !== "true" || process.env.CONFIRM_RESTORE !== "yes" || process.env.CONFIRM_RESTORE_TARGET !== "production") {
  fail("Set ALLOW_DESTRUCTIVE_RESTORE=true, CONFIRM_RESTORE=yes, and CONFIRM_RESTORE_TARGET=production to run a destructive restore");
}

const encrypted = readFileSync(backupFile);
const checksum = createHash("sha256").update(encrypted).digest("hex");
const checksumFile = `${backupFile}.sha256`;
if (!existsSync(checksumFile)) fail("Backup checksum sidecar is required");
const expectedChecksum = readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
if (!/^[a-f0-9]{64}$/i.test(expectedChecksum) || expectedChecksum.toLowerCase() !== checksum) fail("Backup checksum verification failed");

const plaintext = decrypt(encrypted, encryptionKey);
const tempFile = `${backupFile}.${process.pid}.restore.tmp`;
writeFileSync(tempFile, plaintext, { mode: 0o600, flag: "wx" });
try {
  await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--exit-on-error", "--dbname", `${new URL(DATABASE_URL).pathname.slice(1)}${new URL(DATABASE_URL).search}`, ...databaseArgs(DATABASE_URL), tempFile]);
  console.log(JSON.stringify({ ok: true, restoredFrom: backupFile, checksum }));
} finally {
  if (existsSync(tempFile)) unlinkSync(tempFile);
}

function readKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) fail("BACKUP_ENCRYPTION_KEY must be base64 for exactly 32 bytes");
  return key;
}

function decrypt(envelope: Buffer, key: Buffer): Buffer {
  const header = Buffer.from("CLIPREACH-BACKUP-V1\n");
  if (envelope.subarray(0, header.length).compare(header) !== 0) fail("Unsupported backup envelope");
  const iv = envelope.subarray(header.length, header.length + 12);
  const tag = envelope.subarray(header.length + 12, header.length + 28);
  const ciphertext = envelope.subarray(header.length + 28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail("Backup decryption or authentication failed");
  }
}

function databaseArgs(value: string): string[] {
  const parsed = new URL(value);
  return ["--host", parsed.hostname, "--port", parsed.port || "5432", "--username", decodeURIComponent(parsed.username)];
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const parsed = new URL(DATABASE_URL);
    const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) } });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code ?? "unknown"}`)));
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
