import { test, expect } from "@playwright/test";

test("public page carries baseline security headers", async ({ request }) => {
  const res = await request.get("/en");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("admin route also carries security headers", async ({ request }) => {
  // /admin redirects unauthenticated users to /admin/login; either way the
  // middleware should have stamped the headers on the response.
  const res = await request.get("/admin/login");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
});
