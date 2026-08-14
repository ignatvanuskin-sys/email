import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "clipreach_session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/register",
]);

// Lightweight page protection: full sessions are validated by each API route.
// Redirects anonymous visitors away from the app pages and signed-in users away
// from /login and /register.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(COOKIE));

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.has(pathname);

  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
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