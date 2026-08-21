import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `cr_live_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export async function authenticateApiKey(req: Request, requiredScope: string) {
  const authorization = req.headers.get("authorization") ?? "";
  const key = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!key) return null;
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) }, include: { user: true } });
  if (!record || (record.expiresAt && record.expiresAt <= new Date())) return null;
  const scopes = new Set(record.scopes.split(",").map((scope) => scope.trim()));
  if (!scopes.has(requiredScope) && !scopes.has("*")) return null;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 5 * 60 * 1000);
  await prisma.apiKey.updateMany({
    where: { id: record.id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }] },
    data: { lastUsedAt: now },
  });
  return record.user;
}
