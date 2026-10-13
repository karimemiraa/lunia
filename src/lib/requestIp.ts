import { headers } from "next/headers";

/**
 * The caller's IP for rate limiting. Prefers X-Real-IP (nginx sets it to
 * $remote_addr — not client-appendable), else the LAST X-Forwarded-For entry
 * (nginx appends the real peer; the leftmost entries are client-supplied and
 * spoofable, so they must never be used for limits).
 */
export function ipFromHeaders(h: Headers): string {
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : "unknown";
}

export async function requestIp(): Promise<string> {
  return ipFromHeaders(await headers());
}
