import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRedis } from "@/lib/redis";
import { recordEvent, recordPageView } from "@/modules/analytics/track";

// Public, unauthenticated beacon: the public site posts here on every route
// change and for a handful of funnel events. Analytics must never break a
// page, so every path -- bad input, DNT, rate limit, a DB hiccup -- ends the
// same way: a bodyless 204. We also never echo any of the input back.

const trackSchema = z.object({
  type: z.enum(["pageview", "event"]),
  path: z.string().min(1).max(2048).optional(),
  source: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  referrer: z.string().max(2048).optional(),
  locale: z.string().max(20).optional(),
  sessionId: z.string().min(1).max(200),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const RATE_LIMIT_MAX_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// Coarser, IP-scoped limit: the per-session limit above is keyed on a
// client-supplied sessionId, which an attacker can rotate per request to
// bypass it entirely and flood PageView/AnalyticsEvent with unbounded rows.
// This second limit is keyed on the caller's IP so rotating the sessionId
// no longer helps. Deliberately looser than the per-session cap since one
// IP can legitimately host many real visitors (NAT, offices, CGNAT).
const IP_RATE_LIMIT_MAX_PER_MINUTE = 300;
const IP_RATE_LIMIT_WINDOW_SECONDS = 60;
const UNKNOWN_IP = "unknown";

// Max request body we're willing to parse. The per-field caps in track.ts
// already bound what's stored, but an unbounded body still costs CPU/memory
// to parse before we ever get to validate it -- reject oversized bodies
// before touching request.json().
const MAX_BODY_BYTES = 16384;

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function isDoNotTrack(request: Request): boolean {
  return request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1";
}

/**
 * Best-effort client IP for rate-limiting only -- never stored, never
 * returned. We deliberately never persist or log the raw value; it's hashed
 * before it ever becomes a Redis key (see withinIpRateLimit).
 */
function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return UNKNOWN_IP;
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** Fails open (allows) if Redis is unreachable -- a beacon must never 5xx. */
async function withinRateLimit(sessionId: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `trk:${sessionId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count <= RATE_LIMIT_MAX_PER_MINUTE;
  } catch {
    return true;
  }
}

/**
 * Coarser IP-scoped limit, checked in addition to the per-session limit.
 * The IP itself is never stored -- only a truncated SHA-256 hash is used as
 * the ephemeral Redis key, and that key expires after the window. Fails
 * open on Redis errors, same as withinRateLimit.
 */
async function withinIpRateLimit(request: Request): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `trkip:${hashIp(clientIp(request))}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, IP_RATE_LIMIT_WINDOW_SECONDS);
    }
    return count <= IP_RATE_LIMIT_MAX_PER_MINUTE;
  } catch {
    return true;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (isDoNotTrack(request)) {
      return noContent();
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return noContent();
    }

    if (!(await withinIpRateLimit(request))) {
      return noContent();
    }

    const body: unknown = await request.json();
    const parsed = trackSchema.safeParse(body);
    if (!parsed.success) {
      return noContent();
    }
    const input = parsed.data;

    if (!(await withinRateLimit(input.sessionId))) {
      return noContent();
    }

    if (input.type === "pageview") {
      if (!input.path) return noContent();
      await recordPageView({
        path: input.path,
        locale: input.locale,
        referrer: input.referrer,
        source: input.source,
        sessionId: input.sessionId,
      });
    } else {
      if (!input.name) return noContent();
      await recordEvent({
        name: input.name,
        path: input.path,
        sessionId: input.sessionId,
        meta: input.meta,
      });
    }

    return noContent();
  } catch {
    // Analytics ingest must never surface an error to the caller.
    return noContent();
  }
}
