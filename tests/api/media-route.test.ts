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
});
