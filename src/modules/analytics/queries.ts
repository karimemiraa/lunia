// Read-only analytics query helpers, built on top of the PageView /
// AnalyticsEvent rows written by src/modules/analytics/track.ts. No writes
// happen here.
//
// `from`/`to` are Date instants in UTC, and every range below is half-open:
// [from, to) -- a row with createdAt === to is excluded. Callers who want to
// bucket by center-local (Asia/Riyadh) calendar day should compute their
// `from`/`to` with centerLocalToUtc() from src/modules/booking/availability.ts
// (e.g. centerLocalToUtc(dateISO, 0) / centerLocalToUtc(dateISO, 1440)) before
// calling these functions -- these functions themselves do no timezone math.
//
// Metric definitions:
//
// - trafficSources: groups PageView rows in range by `source`, mapping a
//   null source to the literal "direct" (i.e. no referral/utm attribution).
//   `views` is the row count per source; `sessions` is the count of
//   *distinct* sessionId values per source (so N page views in one visit
//   count as one session). Ordered by views desc.
//
// - topPages: the top `limit` PageView `path` values in range, ordered by
//   view (row) count desc.
//
// - bookingConversion: `startedSessions` is the count of *distinct*
//   sessionId values with a "booking_started" AnalyticsEvent in range --
//   one visitor can start the booking flow more than once in a session, and
//   we only want to count them once as "having started". `completed` is
//   the count of *distinct* sessionId values with a "booking_completed"
//   AnalyticsEvent in range -- mirroring startedSessions' distinct-session
//   counting so `rate` (completed / startedSessions) can never exceed 1: a
//   session firing "booking_completed" more than once still only counts
//   once as "having completed". `rate` is completed / startedSessions,
//   guarded to 0 when startedSessions is 0 (avoids NaN/Infinity).
//
// - sessionsCount: count of distinct sessionId values in PageView in range
//   (overall traffic, independent of source).

import { prisma } from "@/lib/db";

export interface DateRange {
  from: Date;
  to: Date;
}

export interface TrafficSourceRow {
  source: string;
  views: number;
  sessions: number;
}

export interface TopPageRow {
  path: string;
  views: number;
}

export interface BookingConversion {
  startedSessions: number;
  completed: number;
  rate: number;
}

const DIRECT_SOURCE = "direct";

/**
 * Traffic broken down by attribution source: view count and distinct
 * session count per source, ordered by views desc. See module header for
 * the "direct" / distinct-session definitions.
 */
export async function trafficSources({ from, to }: DateRange): Promise<TrafficSourceRow[]> {
  // A single query, then one JS pass to aggregate -- no per-row N+1.
  const rows = await prisma.pageView.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { source: true, sessionId: true },
  });

  const bySource = new Map<string, { views: number; sessions: Set<string> }>();
  for (const row of rows) {
    const key = row.source ?? DIRECT_SOURCE;
    let bucket = bySource.get(key);
    if (!bucket) {
      bucket = { views: 0, sessions: new Set<string>() };
      bySource.set(key, bucket);
    }
    bucket.views += 1;
    bucket.sessions.add(row.sessionId);
  }

  return Array.from(bySource.entries())
    .map(([source, { views, sessions }]) => ({ source, views, sessions: sessions.size }))
    .sort((a, b) => b.views - a.views);
}

/**
 * Top pages by view count in range. See module header for the definition.
 */
export async function topPages({
  from,
  to,
  limit = 10,
}: DateRange & { limit?: number }): Promise<TopPageRow[]> {
  // A single DB-side aggregate query (GROUP BY path, ORDER BY count DESC,
  // LIMIT) -- no per-row N+1.
  const rows = await prisma.pageView.groupBy({
    by: ["path"],
    where: { createdAt: { gte: from, lt: to } },
    _count: { _all: true },
    orderBy: { _count: { path: "desc" } },
    take: limit,
  });

  return rows.map((row) => ({ path: row.path, views: row._count._all }));
}

/**
 * Booking funnel conversion for the range. See module header for the
 * startedSessions / completed / rate definitions.
 */
export async function bookingConversion({ from, to }: DateRange): Promise<BookingConversion> {
  const [startedSessionRows, completedSessionRows] = await Promise.all([
    // distinct: ["sessionId"] issues a single SELECT DISTINCT ON query --
    // no per-row N+1 -- we only need the row count, so select as little as
    // possible.
    prisma.analyticsEvent.findMany({
      where: { name: "booking_started", createdAt: { gte: from, lt: to } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    }),
    prisma.analyticsEvent.findMany({
      where: { name: "booking_completed", createdAt: { gte: from, lt: to } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    }),
  ]);

  const startedSessions = startedSessionRows.length;
  const completed = completedSessionRows.length;
  const rate = startedSessions > 0 ? completed / startedSessions : 0;

  return { startedSessions, completed, rate };
}

/**
 * Overall distinct-session traffic count in range (see module header).
 */
export async function sessionsCount({ from, to }: DateRange): Promise<number> {
  const rows = await prisma.pageView.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  return rows.length;
}
