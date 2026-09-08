import { test, expect } from "@playwright/test";

const LOCALES = ["en", "ar"] as const;

// Key routes covering every public page family (static + both dynamic
// [slug] shapes), crawled in both locales.
const ROUTES = [
  "/",
  "/about",
  "/services",
  "/services/skin",
  "/brands",
  "/brands/zo-skin-health",
  "/results",
  "/journal",
  "/contact",
  "/book",
];

for (const locale of LOCALES) {
  for (const route of ROUTES) {
    const path = route === "/" ? `/${locale}` : `/${locale}${route}`;

    test(`${path}: 200, title, one h1, hreflang alternates`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // Non-empty <title> from generateMetadata.
      await expect(page).toHaveTitle(/.+/);

      // Exactly one h1 per page.
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCount(1);

      // hreflang alternates: at least ar-SA + en present in <head>.
      const hreflangs = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) =>
        els.map((el) => el.getAttribute("hreflang")),
      );
      expect(hreflangs).toContain("ar-SA");
      expect(hreflangs).toContain("en");
    });
  }
}

test("GET /sitemap.xml returns 200 with <urlset>", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<urlset");
});

test("GET /robots.txt returns 200 with a Sitemap directive", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Sitemap:");
});

test("GET /llms.txt returns 200 and mentions Lunia", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Lunia");
});
