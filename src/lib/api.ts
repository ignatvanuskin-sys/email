import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { User } from "@prisma/client";
import { getCurrentUser } from "./auth";
import { randomUUID } from "node:crypto";

/** Returns the current user or null in an API context. */
export async function getApiUser(): Promise<User | null> {
  return getCurrentUser();
}

export function unauthorized(): NextResponse {
  return apiError("Unauthorized", 401);
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

export function apiError(message: string, status: number, code = status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST"): NextResponse {
  const requestId = randomUUID();
  return NextResponse.json({ error: message, code, requestId }, { status, headers: { "x-request-id": requestId } });
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return badRequest(err.issues.map((i) => i.message).join("; "));
  }
  if (err instanceof Error && err.message) {
    return badRequest(err.message);
  }
  return serverError();
}

/** Read and JSON-parse a request body safely. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
