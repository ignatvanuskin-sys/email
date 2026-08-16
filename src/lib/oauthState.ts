import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export function hashOAuthState(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export async function createOAuthState(userId: string, provider: string, payload: Record<string, unknown> = {}) { const state = randomBytes(32).toString("base64url"); await prisma.oAuthState.create({ data: { userId, provider, stateHash: hashOAuthState(state), payload: JSON.stringify(payload), expiresAt: new Date(Date.now() + 10 * 60_000) } }); return state; }
export async function consumeOAuthState(state: string, provider: string) { const record = await prisma.oAuthState.findUnique({ where: { stateHash: hashOAuthState(state) } }); if (!record || record.provider !== provider || record.usedAt || record.expiresAt <= new Date()) return null; await prisma.oAuthState.update({ where: { id: record.id }, data: { usedAt: new Date() } }); return record; }
