import { describe, it, expect, afterAll } from "vitest";
import { storage } from "@/lib/storage";
import { GET } from "@/app/api/media/[...path]/route";

const testKey = `test/media-route-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

describe("GET /api/media/[...path]", () => {
  afterAll(async () => {
    await storage.delete(testKey);
  });

  it("serves stored bytes with hardening headers alongside content type and caching", async () => {
    await storage.put(testKey, Buffer.from("fake image bytes"), "image/png");

    const response = await GET(new Request(`http://localhost/api/media/${testKey}`), {
      params: Promise.resolve({ path: testKey.split("/") }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    // Defense in depth against stored-XSS via uploaded media: nosniff stops
    // MIME-sniffing into an executable type, and the sandboxed CSP blocks
    // any script/plugin/frame execution even for a risky stored type.
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(Buffer.from("fake image bytes"))).toBe(true);
  });

  it("returns 404 without leaking headers for a missing key", async () => {
    const response = await GET(new Request("http://localhost/api/media/does/not/exist.png"), {
      params: Promise.resolve({ path: ["does", "not", "exist.png"] }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for a path-traversal attempt", async () => {
    const response = await GET(new Request("http://localhost/api/media/..%2Fevil"), {
      params: Promise.resolve({ path: ["..", "evil"] }),
    });

    expect(response.status).toBe(404);
  });

  it("serves byte ranges with 206 so iOS Safari can play video", async () => {
    await storage.put(testKey, Buffer.from("0123456789"), "video/mp4");
    const call = (range: string) =>
      GET(new Request(`http://localhost/api/media/${testKey}`, { headers: { range } }), {
        params: Promise.resolve({ path: testKey.split("/") }),
      });

    const probe = await call("bytes=0-1");
    expect(probe.status).toBe(206);
    expect(probe.headers.get("Content-Range")).toBe("bytes 0-1/10");
    expect(probe.headers.get("Accept-Ranges")).toBe("bytes");
    expect(Buffer.from(await probe.arrayBuffer()).toString()).toBe("01");

    const open = await call("bytes=7-");
    expect(open.headers.get("Content-Range")).toBe("bytes 7-9/10");
    expect(Buffer.from(await open.arrayBuffer()).toString()).toBe("789");

    const suffix = await call("bytes=-3");
    expect(Buffer.from(await suffix.arrayBuffer()).toString()).toBe("789");

    const beyond = await call("bytes=20-30");
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get("Content-Range")).toBe("bytes */10");
  });
});
