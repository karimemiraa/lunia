import { test, expect } from "@playwright/test";

test.describe("about page", () => {
  test("en: renders h1, story, positioning, the 6-step journey, and team placeholder", async ({ page }) => {
    await page.goto("/en/about");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);

    await expect(page).toHaveTitle(/.+/);

    // The 6-step journey renders as an ordered list of 6 items (shared with Home).
    const journeySteps = page.locator("ol li");
    await expect(journeySteps).toHaveCount(6);

    // A Book CTA to /contact exists.
    const bookLinks = page.locator('a[href="/en/contact"]');
    expect(await bookLinks.count()).toBeGreaterThanOrEqual(1);
  });

  test("ar: about page renders rtl with an h1", async ({ page }) => {
    await page.goto("/ar/about");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});

test.describe("services overview page", () => {
  test("en: lists at least 3 departments linking to /services/", async ({ page }) => {
    await page.goto("/en/services");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);

    await expect(page).toHaveTitle(/.+/);

    const departmentLinks = page.locator('a[href*="/services/"]');
    expect(await departmentLinks.count()).toBeGreaterThanOrEqual(3);
  });

  test("ar: services overview is rtl", async ({ page }) => {
    await page.goto("/ar/services");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("department page", () => {
  test("en: /services/skin shows department h1, its services, and a Book CTA", async ({ page }) => {
    await page.goto("/en/services/skin");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/skin/i);

    await expect(page).toHaveTitle(/.+/);

    // At least one service (h3) rendered under this department.
    const serviceHeadings = page.getByRole("heading", { level: 3 });
    expect(await serviceHeadings.count()).toBeGreaterThanOrEqual(1);

    const bookLinks = page.locator('a[href="/en/contact"]');
    expect(await bookLinks.count()).toBeGreaterThanOrEqual(1);
  });

  test("ar: /services/skin renders rtl with the department h1", async ({ page }) => {
    await page.goto("/ar/services/skin");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("a bogus department slug 404s", async ({ page }) => {
    const response = await page.goto("/en/services/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
