import { test, expect } from "@playwright/test";

const LOCALES = ["en", "ar"] as const;

for (const locale of LOCALES) {
  test(`home page (${locale}): hero, services, brands, journey, book CTA, metadata`, async ({ page }) => {
    await page.goto(`/${locale}`);

    // Exactly one h1 — the hero headline.
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);

    // Non-empty <title> from generateMetadata.
    await expect(page).toHaveTitle(/.+/);

    // Services teaser: at least 3 department links.
    const serviceLinks = page.locator('a[href*="/services/"]');
    await expect(serviceLinks).not.toHaveCount(0);
    expect(await serviceLinks.count()).toBeGreaterThanOrEqual(3);

    // Featured brands: at least one brand link.
    const brandLinks = page.locator('a[href*="/brands/"]');
    expect(await brandLinks.count()).toBeGreaterThanOrEqual(1);

    // A Book CTA linking to /contact exists (hero and/or cta band).
    const bookLinks = page.locator(`a[href="/${locale}/contact"]`);
    expect(await bookLinks.count()).toBeGreaterThanOrEqual(1);

    // The 6-step journey renders all 6 steps as an ordered list.
    const journeySteps = page.locator("ol li");
    await expect(journeySteps).toHaveCount(6);
  });
}

test("arabic home is rtl", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("english home is ltr", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
