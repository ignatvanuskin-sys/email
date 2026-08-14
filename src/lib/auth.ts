import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { env } from "./env";

const COOKIE_NAME = "clipreach_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const secret = new TextEncoder().encode(env.SESSION_SECRET);

export type SessionPayload = {
  userId: string;
  email: string;
  name?: string | null;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ userId: payload.userId, email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);

  const tokenHash = sessionTokenHash(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({ data: { tokenHash, userId: payload.userId, expiresAt } });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.APP_URL.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = sessionTokenHash(token);
    // best-effort cleanup of the DB session row
    await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  store.delete(COOKIE_NAME);
}

// Returns the current User (with normalized provider/lead counts) or null.
export async function getCurrentUser() {
  const token = await readSessionToken();
  if (!token) return null;

  let payload: SessionPayload;
  try {
    const { payload: verified } = await jwtVerify<SessionPayload>(token, secret);
    payload = { userId: verified.userId, email: verified.email, name: verified.name };
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return null;
  return user;
}

async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}