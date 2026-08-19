import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { User } from "@prisma/client";
import { getCurrentUser } from "./auth";
import { randomUUID } from "node:crypto";
import { env } from "./env";

/** Returns the current user or null in an API context. */
export async function getApiUser(): Promise<User | null> {
  return getCurrentUser();
}

export function unauthorized(): NextResponse {
  return apiError("Требуется авторизация", 401);
}

export function assertSameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).origin !== new URL(env.APP_URL).origin) return apiError("Недопустимый источник запроса", 403, "CSRF_BLOCKED");
  } catch {
    return apiError("Недопустимый источник запроса", 403, "CSRF_BLOCKED");
  }
  return null;
}

export function badRequest(message: string): NextResponse {
  return apiError(message, 400);
}

export function notFound(message = "Not found"): NextResponse {
  return apiError(message, 404);
}

export function serverError(message = "Something went wrong"): NextResponse {
  return apiError(message, 500);
}

export function apiError(message: string, status: number, code = status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST", requestId = randomUUID()): NextResponse {
  return NextResponse.json({ error: message, code, requestId }, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function handleError(err: unknown): NextResponse {
  const requestId = randomUUID();
  if (err instanceof ZodError) {
    return apiError(err.issues.map((i) => i.message).join("; "), 400, "BAD_REQUEST", requestId);
  }
  console.error(`[api-error:${requestId}]`, err);
  return apiError("Request could not be processed", 500, "INTERNAL_ERROR", requestId);
}

/** Read and JSON-parse a request body safely. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
