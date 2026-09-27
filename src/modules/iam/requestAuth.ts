import { getCurrentUser } from "./rbac";

/** Staff session cookie (see admin/_components/requireAdmin.ts). */
export const STAFF_SESSION_COOKIE = "lunia_session";

// Reads one cookie from a raw Cookie header. Route handlers use this instead
// of next/headers' cookies() so they can be exercised directly in tests with
// a plain Request.
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

/** Resolves the STAFF user (with permissions) behind a request's session cookie, or null. */
export async function getStaffUserFromRequest(request: Request) {
  return getCurrentUser(readCookie(request.headers.get("cookie"), STAFF_SESSION_COOKIE));
}
