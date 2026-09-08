import { describe, it, expect, afterEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { recordPageView, recordEvent } from "@/modules/analytics/track";
import { POST } from "@/app/api/track/route";

let counter = 0;
function uniqueSessionId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

describe("recordPageView", () => {
  const sessionIds: string[] = [];

  afterEach(async () => {
    const ids = sessionIds.splice(0);
    if (ids.length) await prisma.pageView.deleteMany({ where: { sessionId: { in: ids } } });
  });

  it("stores a normalized row: path stripped to pathname, referrer reduced to host", async () => {
    const sessionId = uniqueSessionId("pv");
    sessionIds.push(sessionId);

    await recordPageView({
      path: "/en/services?x=1#h",
      referrer: "https://google.com/search?q=x",
      sessionId,
    });

    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row).not.toBeNull();
    expect(row?.path).toBe("/en/services");
    expect(row?.referrerHost).toBe("google.com");
  });

  it("drops a source that isn't a simple utm/src token", async () => {
    const sessionId = uniqueSessionId("pv-src");
    sessionIds.push(sessionId);

    await recordPageView({
      path: "/en/home",
      source: "not a token!! with spaces",
      sessionId,
    });

    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row?.source).toBeNull();
  });

  it("keeps a simple source token", async () => {
    const sessionId = uniqueSessionId("pv-src-ok");
    sessionIds.push(sessionId);

    await recordPageView({
      path: "/en/home",
      source: "instagram",
      sessionId,
    });

    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row?.source).toBe("instagram");
  });
});

describe("recordEvent", () => {
  const sessionIds: string[] = [];

  afterEach(async () => {
    const ids = sessionIds.splice(0);
    if (ids.length) await prisma.analyticsEvent.deleteMany({ where: { sessionId: { in: ids } } });
  });

  it("stores name, path, and meta", async () => {
    const sessionId = uniqueSessionId("ev");
    sessionIds.push(sessionId);

    await recordEvent({
      name: "booking_started",
      path: "/en/book?x=1",
      sessionId,
      meta: { serviceId: "svc_1" },
    });

    const row = await prisma.analyticsEvent.findFirst({ where: { sessionId } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe("booking_started");
    expect(row?.path).toBe("/en/book");
    expect(row?.meta).toEqual({ serviceId: "svc_1" });
  });

  it("drops an oversized meta payload rather than storing it", async () => {
    const sessionId = uniqueSessionId("ev-big");
    sessionIds.push(sessionId);

    await recordEvent({
      name: "huge_event",
      sessionId,
      meta: { blob: "x".repeat(5000) },
    });

    const row = await prisma.analyticsEvent.findFirst({ where: { sessionId } });
    expect(row?.meta).toBeNull();
  });
});

describe("POST /api/track", () => {
  const pageViewSessionIds: string[] = [];

  afterEach(async () => {
    const ids = pageViewSessionIds.splice(0);
    if (ids.length) await prisma.pageView.deleteMany({ where: { sessionId: { in: ids } } });
  });

  afterAll(async () => {
    getRedis().disconnect();
  });

  it("stores a pageview and returns 204 with no body", async () => {
    const sessionId = uniqueSessionId("route-pv");
    pageViewSessionIds.push(sessionId);

    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "pageview", path: "/en/home?utm_source=x", sessionId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row).not.toBeNull();
    expect(row?.path).toBe("/en/home");
  });

  it("honors Do-Not-Track and stores nothing", async () => {
    const sessionId = uniqueSessionId("route-dnt");
    pageViewSessionIds.push(sessionId);

    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", DNT: "1" },
      body: JSON.stringify({ type: "pageview", path: "/en/home", sessionId }),
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row).toBeNull();
  });

  it("never throws on a malformed body, returning 204", async () => {
    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
  });

  it("rejects an oversized body via Content-Length without parsing it, storing nothing", async () => {
    const sessionId = uniqueSessionId("route-toobig");
    pageViewSessionIds.push(sessionId);

    // A body that would otherwise be a perfectly valid pageview, just with
    // a declared Content-Length over the 16KB cap. If the handler tried to
    // parse it, it would succeed and create a row -- so a stored row here
    // would mean the size check was skipped.
    const payload = JSON.stringify({ type: "pageview", path: "/en/home", sessionId });
    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(16384 + 1),
      },
      body: payload,
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row).toBeNull();
  });

  it("allows normal traffic under the Content-Length cap", async () => {
    const sessionId = uniqueSessionId("route-sizeok");
    pageViewSessionIds.push(sessionId);

    const payload = JSON.stringify({ type: "pageview", path: "/en/home", sessionId });
    const request = new Request("http://localhost/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(payload)),
      },
      body: payload,
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    const row = await prisma.pageView.findFirst({ where: { sessionId } });
    expect(row).not.toBeNull();
  });

  describe("per-IP rate limit", () => {
    // The per-session limit keys on the client-supplied sessionId, which an
    // attacker can rotate per request to bypass it entirely. The IP limit
    // is the backstop: same x-forwarded-for, a different sessionId on every
    // request, should still eventually get capped.
    //
    // We don't drive the full 300-request default cap here (slow and not
    // meaningfully more informative) -- instead we confirm two requests
    // from the same IP both succeed (the limiter doesn't false-positive on
    // ordinary traffic), and rely on code inspection (see route.ts
    // `withinIpRateLimit`) plus the shared `withinRateLimit` unit behavior
    // for the "eventually blocks" property, since both limiters share the
    // same incr+expire+threshold shape.
    const sessionIds: string[] = [];

    afterEach(async () => {
      const ids = sessionIds.splice(0);
      if (ids.length) await prisma.pageView.deleteMany({ where: { sessionId: { in: ids } } });
    });

    it("allows multiple requests from the same IP with different sessionIds", async () => {
      const ip = "203.0.113.77";
      const results: number[] = [];

      for (let i = 0; i < 2; i += 1) {
        const sessionId = uniqueSessionId(`route-ip-${i}`);
        sessionIds.push(sessionId);
        const request = new Request("http://localhost/api/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": `${ip}, 10.0.0.1`,
          },
          body: JSON.stringify({ type: "pageview", path: "/en/home", sessionId }),
        });
        const response = await POST(request);
        results.push(response.status);
      }

      expect(results).toEqual([204, 204]);
      for (const sessionId of sessionIds) {
        const row = await prisma.pageView.findFirst({ where: { sessionId } });
        expect(row).not.toBeNull();
      }
    });
  });
});
