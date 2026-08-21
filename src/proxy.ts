import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/csrf";

const COOKIE = "clipreach_session";
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);
const CSRF_EXEMPT_PREFIXES = [
  "/api/v1/",
  "/api/webhooks/",
  "/api/unsubscribe",
  "/api/internal/worker",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(COOKIE));

  if (pathname.startsWith("/api")) {
    const method = req.method.toUpperCase();
    if (hasSession && !["GET", "HEAD", "OPTIONS"].includes(method) && !CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      const blocked = assertSameOrigin(req);
      if (blocked) return blocked;
    }
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.has(pathname);
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}


export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
