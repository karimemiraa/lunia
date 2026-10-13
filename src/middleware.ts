import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Baseline security headers applied to every page/document response. The
// matcher excludes /api/* so the media route (/api/media/[...path]) keeps its
// own stricter per-response CSP untouched. HSTS is production-only (it must
// not be sent over plain-HTTP local dev).
//
// Scripts: the areas holding private data (staff admin, superadmin, the
// customer account and the public invoice view) get a per-request nonce with
// 'strict-dynamic', so an injected <script> never runs there. Those pages are
// all rendered per request (Next.js reads the nonce from the request's CSP
// header and stamps it on its own scripts). The public marketing pages stay
// statically cached and keep 'unsafe-inline' — they show no private data.
// Styles keep 'unsafe-inline' everywhere (React style attributes need it).
const STRICT_PATH = /^\/(admin|superadmin)(\/|$)|^\/(ar|en)\/(account|invoice)(\/|$)/;

function buildCsp(nonce: string | null): string {
  const dev = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
  return [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    // React's dev build uses eval() for debugging; production never does.
    nonce ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev}` : `script-src 'self' 'unsafe-inline'${dev}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

function withSecurityHeaders(res: NextResponse, csp: string): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Content-Security-Policy", csp);
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return res;
}

// Forwards extra request headers to the page render, on top of whatever
// request-header override another middleware (next-intl) already set. Same
// wire format NextResponse.next({ request: { headers } }) uses.
function forwardRequestHeaders(res: NextResponse, request: NextRequest, extra: Record<string, string>): void {
  const existing = res.headers.get("x-middleware-override-headers");
  const keys = new Set(existing ? existing.split(",") : []);
  if (!existing) {
    for (const [k, v] of request.headers) {
      res.headers.set(`x-middleware-request-${k}`, v);
      keys.add(k);
    }
  }
  for (const [k, v] of Object.entries(extra)) {
    res.headers.set(`x-middleware-request-${k}`, v);
    keys.add(k);
  }
  res.headers.set("x-middleware-override-headers", [...keys].join(","));
}

export default function middleware(request: NextRequest): NextResponse {
  // Admin + superadmin routes are not localized — pass them straight through
  // (auth is enforced in-page by requireAdmin). Everything else is a public
  // localized route handled by next-intl. Without this, next-intl would
  // prepend a locale (e.g. /superadmin -> /ar/superadmin) and 404, since
  // those routes live outside the [locale] segment. api/_next/static are
  // excluded by the matcher.
  const { pathname } = request.nextUrl;
  const isNonLocalized = pathname.startsWith("/admin") || pathname.startsWith("/superadmin");
  const res = isNonLocalized ? NextResponse.next() : (intlMiddleware(request) as NextResponse);
  if (!STRICT_PATH.test(pathname)) return withSecurityHeaders(res, buildCsp(null));
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  forwardRequestHeaders(res, request, { "x-nonce": nonce, "content-security-policy": csp });
  return withSecurityHeaders(res, csp);
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
