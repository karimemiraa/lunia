import { test, expect, type Page } from "@playwright/test";

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

// Private areas (admin, superadmin, customer account, invoice view) run with a
// per-request script nonce: every Next.js script carries it, our own inline
// theme script carries it, and a script that reaches the HTML without it (the
// stored-XSS case) is blocked. The injection is simulated by splicing an
// un-nonced <script> into the real server response, keeping its real headers.
async function injectedScriptRuns(page: Page, path: string): Promise<boolean> {
  await page.route(`**${path}`, async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace("</body>", "<script>window.__injected = true</script></body>");
    await route.fulfill({ response: res, body: html });
  });
  await page.goto(path);
  await page.unroute(`**${path}`);
  return page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected === true);
}

test("admin pages use a nonce CSP, run their own scripts and block injected ones", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to execute/i.test(m.text())) violations.push(m.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  const res = await page.goto("/admin/login");
  const csp = res!.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");

  // Signing in proves the framework scripts run under the policy.
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  // The nonced inline "match device" theme script ran (dark OS → midnight).
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  expect(violations).toEqual([]);

  expect(await injectedScriptRuns(page, "/admin/settings")).toBe(false);
});

test("customer account and invoice pages use the nonce CSP; public pages don't", async ({ page, request }) => {
  for (const path of ["/en/account/login", "/ar/invoice/x_y"]) {
    const csp = (await request.get(path)).headers()["content-security-policy"] ?? "";
    expect(csp, path).toContain("'strict-dynamic'");
  }
  expect(await injectedScriptRuns(page, "/en/account/login")).toBe(false);

  // Public marketing pages stay statically cached with 'unsafe-inline'
  // (no private data there) — the same injection runs, as documented.
  const publicCsp = (await request.get("/en")).headers()["content-security-policy"] ?? "";
  expect(publicCsp).toContain("script-src 'self' 'unsafe-inline'");
  expect(await injectedScriptRuns(page, "/en/about")).toBe(true);
});
