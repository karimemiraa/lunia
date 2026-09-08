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
});
