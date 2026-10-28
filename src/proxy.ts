import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only (cookie present). The real session check runs in the
// Data Access Layer (server/session.ts) on every page section and action.
const PUBLIC = ["/login", "/setup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.has("painel_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Device API, Next internals and static files are not part of the admin session.
  // `dev/` holds public test files (e.g. the demo M3U used by the TV app during development).
  matcher: ["/((?!api/v1|dev/|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
