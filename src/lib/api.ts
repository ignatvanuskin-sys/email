import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { User } from "@prisma/client";
import { getCurrentUser } from "./auth";
import { PublicError } from "./errors";

export async function getApiUser(): Promise<User | null> {
  return getCurrentUser();
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = "Something went wrong"): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return badRequest(err.issues.map((issue) => issue.message).join("; "));
  }
  if (err instanceof PublicError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Keep upstream/provider/DB details server-side. The caller receives a stable
  // response while operators can inspect the structured server log.
  console.error("[api-error]", err);
  return serverError();
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
