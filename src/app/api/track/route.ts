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

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function isDoNotTrack(request: Request): boolean {
  return request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1";
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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (isDoNotTrack(request)) {
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
