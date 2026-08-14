import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "./env";

// AES-256-GCM encryption for provider credentials at rest (spec §21).
// Key is supplied as base64-encoded 32 bytes via CREDENTIALS_KEY.
// Even if no key is configured we derive a stable dev key so the app runs,
// but production must set CREDENTIALS_KEY.

function getKey(): Buffer {
  const raw = env.CREDENTIALS_KEY ?? "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  // A raw 32-character key is supported for existing local installations.
  if (raw.length === 32) return Buffer.from(raw, "utf8");
  // Stable fallback for legacy development databases. This is deliberately
  // derived from the stable session secret, never generated at startup.
  return createHash("sha256").update(env.SESSION_SECRET).digest();
}

export type EncryptedPayload = { iv: string; data: string; tag: string };

export function encryptCredentials(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload: EncryptedPayload = {
    iv: iv.toString("base64"),
    data: enc.toString("base64"),
    tag: tag.toString("base64"),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decryptCredentials(encrypted: string): string {
  const key = getKey();
  let payload: EncryptedPayload;
  try {
    payload = JSON.parse(Buffer.from(encrypted, "base64").toString("utf8"));
  } catch {
    throw new Error("Unable to parse encrypted credentials payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}