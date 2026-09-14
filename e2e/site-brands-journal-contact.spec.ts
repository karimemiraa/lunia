import { test, expect } from "@playwright/test";

test.describe("brands overview page", () => {
  test("en: lists at least 5 brand links", async ({ page }) => {
    await page.goto("/en/brands");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);

    await expect(page).toHaveTitle(/.+/);

    const brandLinks = page.locator('a[href*="/brands/"]');
    expect(await brandLinks.count()).toBeGreaterThanOrEqual(5);
  });

  test("ar: brands overview is rtl", async ({ page }) => {
    await page.goto("/ar/brands");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });
});

test.describe("brand page", () => {
  test("en: /brands/pca-skin shows the brand h1 and a Book CTA", async ({ page }) => {
    await page.goto("/en/brands/pca-skin");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/pca skin/i);

    await expect(page).toHaveTitle(/.+/);

    const bookLinks = page.locator('a[href="/en/book"]');
    expect(await bookLinks.count()).toBeGreaterThanOrEqual(1);
  });

  test("ar: /brands/pca-skin renders rtl with the brand h1", async ({ page }) => {
    await page.goto("/ar/brands/pca-skin");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("a bogus brand slug 404s", async ({ page }) => {
    const response = await page.goto("/en/brands/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});

test.describe("results page", () => {
  test("en: renders a single h1 and a consent note", async ({ page }) => {
    await page.goto("/en/results");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(page).toHaveTitle(/.+/);
  });

  test("ar: results page is rtl", async ({ page }) => {
    await page.goto("/ar/results");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("journal list page", () => {
  test("en: lists at least one post linking to /journal/", async ({ page }) => {
    await page.goto("/en/journal");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(page).toHaveTitle(/.+/);

    const postLinks = page.locator('a[href*="/journal/"]');
    expect(await postLinks.count()).toBeGreaterThanOrEqual(1);
  });

  test("ar: journal list is rtl", async ({ page }) => {
    await page.goto("/ar/journal");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});

test.describe("journal post page", () => {
  test("en: a post page shows the title h1", async ({ page }) => {
    await page.goto("/en/journal/the-korean-philosophy-of-skin-quality");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(page).toHaveTitle(/.+/);
  });

  test("ar: post page is rtl with the title h1", async ({ page }) => {
    await page.goto("/ar/journal/the-korean-philosophy-of-skin-quality");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("a bogus post slug 404s", async ({ page }) => {
    const response = await page.goto("/en/journal/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});

test.describe("contact page", () => {
  test("en: shows the form and submitting valid data shows a success message", async ({ page }) => {
    await page.goto("/en/contact");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(page).toHaveTitle(/.+/);

    await page.getByLabel("Full name").fill("Sarah Test");
    await page.getByLabel("Phone number").fill("+966501234567");
    await page.getByLabel("How can we help?").fill("I'd like to book a diagnostic skin consultation.");

    await page.getByRole("button", { name: "Send inquiry" }).click();

    await expect(page.getByRole("status")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("status")).toContainText(/thank you/i);
  });

  test("ar: contact page renders rtl with the form", async ({ page }) => {
    await page.goto("/ar/contact");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "ارسال الطلب" })).toBeVisible();
  });
});
