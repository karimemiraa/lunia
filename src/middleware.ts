import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Baseline security headers applied to every page/document response. The
// matcher excludes /api/* so the media route (/api/media/[...path]) keeps its
// own stricter per-response CSP untouched. HSTS is production-only (it must
// not be sent over plain-HTTP local dev).
function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      // Next.js injects inline runtime/style; 'unsafe-inline' keeps the app
      // working without per-request nonces. frame-ancestors 'none' + base-uri
      // and object-src lock down clickjacking and base-tag/plugin abuse.
      "style-src 'self' 'unsafe-inline'",
      // React's dev build uses eval() for debugging; production never does, so
      // 'unsafe-eval' is granted only outside production.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join("; "),
  );
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return res;
}

export default function middleware(request: NextRequest): NextResponse {
  // Admin routes are not localized — pass them straight through (auth is
  // enforced in-page by requireAdmin). Everything else is a public localized
  // route handled by next-intl. api/_next/static are excluded by the matcher.
  const res = request.nextUrl.pathname.startsWith("/admin")
    ? NextResponse.next()
    : (intlMiddleware(request) as NextResponse);
  return withSecurityHeaders(res);
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
