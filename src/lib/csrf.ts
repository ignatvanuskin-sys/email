import { env } from "./env";

export function assertSameOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).origin !== new URL(env.APP_URL).origin) {
      return Response.json({ error: "Недопустимый источник запроса", code: "CSRF_BLOCKED" }, { status: 403, headers: { "cache-control": "no-store" } });
    }
  } catch {
    return Response.json({ error: "Недопустимый источник запроса", code: "CSRF_BLOCKED" }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  return null;
}
