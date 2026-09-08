import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  trafficSources,
  topPages,
  bookingConversion,
  sessionsCount,
} from "@/modules/analytics/queries";

// All rows in this suite are created with createdAt inside a single narrow,
// far-future window that nothing else in the codebase writes to, so the
// range query in each test only ever sees rows this suite created (rather
// than filtering by session/path prefix and hoping nothing else matches).
const RANGE_FROM = new Date("2031-06-15T00:00:00.000Z");
const RANGE_TO = new Date("2031-06-16T00:00:00.000Z");
const IN_RANGE = new Date("2031-06-15T12:00:00.000Z");
const OUT_OF_RANGE = new Date("2031-06-16T00:00:00.000Z"); // exactly `to` -- must be excluded ([from, to))

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

describe("analytics queries", () => {
  const pageViewIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(async () => {
    // --- trafficSources / sessionsCount fixtures ---
    // instagram: sessions A (2 views) + B (1 view) = 3 views, 2 sessions
    // google: session C (2 views) = 2 views, 1 session
    // direct (null source): session D (1 view) = 1 view, 1 session
    const sessionA = uid("qa-a");
    const sessionB = uid("qa-b");
    const sessionC = uid("qa-c");
    const sessionD = uid("qa-d");

    const pageViews = [
      { path: "/en/a", source: "instagram", sessionId: sessionA, createdAt: IN_RANGE },
      { path: "/en/a", source: "instagram", sessionId: sessionA, createdAt: IN_RANGE },
      { path: "/en/a", source: "instagram", sessionId: sessionB, createdAt: IN_RANGE },
      { path: "/en/b", source: "google", sessionId: sessionC, createdAt: IN_RANGE },
      { path: "/en/b", source: "google", sessionId: sessionC, createdAt: IN_RANGE },
      { path: "/en/c", source: null, sessionId: sessionD, createdAt: IN_RANGE },
      // Out-of-range row: must never be counted by any query below.
      { path: "/en/a", source: "instagram", sessionId: sessionA, createdAt: OUT_OF_RANGE },
    ];
    for (const data of pageViews) {
      const row = await prisma.pageView.create({ data });
      pageViewIds.push(row.id);
    }

    // --- bookingConversion fixtures ---
    // 3 distinct sessions with a booking_started event: S1, S2, S3.
    // booking_completed: S1 fires it twice, S2 fires it once, S3 never.
    // startedSessions = 3 (distinct sessions with booking_started).
    // completed = 3 (raw event count -- see queries.ts doc comment for why).
    const s1 = uid("qa-s1");
    const s2 = uid("qa-s2");
    const s3 = uid("qa-s3");

    const events = [
      { name: "booking_started", sessionId: s1, createdAt: IN_RANGE },
      { name: "booking_started", sessionId: s2, createdAt: IN_RANGE },
      { name: "booking_started", sessionId: s3, createdAt: IN_RANGE },
      { name: "booking_completed", sessionId: s1, createdAt: IN_RANGE },
      { name: "booking_completed", sessionId: s1, createdAt: IN_RANGE },
      { name: "booking_completed", sessionId: s2, createdAt: IN_RANGE },
      // Out-of-range: must never be counted.
      { name: "booking_started", sessionId: uid("qa-oor"), createdAt: OUT_OF_RANGE },
    ];
    for (const data of events) {
      const row = await prisma.analyticsEvent.create({ data });
      eventIds.push(row.id);
    }
  });

  afterAll(async () => {
    if (pageViewIds.length) await prisma.pageView.deleteMany({ where: { id: { in: pageViewIds } } });
    if (eventIds.length) await prisma.analyticsEvent.deleteMany({ where: { id: { in: eventIds } } });
  });

  describe("trafficSources", () => {
    it("groups by source, counts views and distinct sessions, orders by views desc", async () => {
      const rows = await trafficSources({ from: RANGE_FROM, to: RANGE_TO });

      expect(rows).toEqual([
        { source: "instagram", views: 3, sessions: 2 },
        { source: "google", views: 2, sessions: 1 },
        { source: "direct", views: 1, sessions: 1 },
      ]);
    });
  });

  describe("topPages", () => {
    it("orders paths by view count desc and respects limit", async () => {
      const rows = await topPages({ from: RANGE_FROM, to: RANGE_TO, limit: 2 });

      expect(rows).toEqual([
        { path: "/en/a", views: 3 },
        { path: "/en/b", views: 2 },
      ]);
    });

    it("defaults to limit 10 when not provided", async () => {
      const rows = await topPages({ from: RANGE_FROM, to: RANGE_TO });

      expect(rows).toEqual([
        { path: "/en/a", views: 3 },
        { path: "/en/b", views: 2 },
        { path: "/en/c", views: 1 },
      ]);
    });
  });

  describe("bookingConversion", () => {
    it("computes startedSessions (distinct), completed (raw event count), and rate", async () => {
      const result = await bookingConversion({ from: RANGE_FROM, to: RANGE_TO });

      expect(result.startedSessions).toBe(3);
      expect(result.completed).toBe(3);
      expect(result.rate).toBeCloseTo(1, 5);
    });

    it("guards against division by zero when there are no started sessions", async () => {
      const farFuture = new Date("2031-06-17T00:00:00.000Z");
      const farFutureEnd = new Date("2031-06-18T00:00:00.000Z");

      const result = await bookingConversion({ from: farFuture, to: farFutureEnd });

      expect(result).toEqual({ startedSessions: 0, completed: 0, rate: 0 });
    });
  });

  describe("sessionsCount", () => {
    it("counts distinct sessionIds in PageView within range", async () => {
      const count = await sessionsCount({ from: RANGE_FROM, to: RANGE_TO });

      // sessions A, B, C, D = 4 distinct sessions (the out-of-range 5th view
      // for session A must not add a session, and doesn't need to anyway).
      expect(count).toBe(4);
    });
  });
});
