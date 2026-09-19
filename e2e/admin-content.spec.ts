import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("page content editor: edit and persist the home hero headline", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/content/home");
  await expect(page.getByRole("heading", { name: "Content: Home" })).toBeVisible();

  const stamp = Date.now();
  const headlineEn = `E2E Headline EN ${stamp}`;
  const headlineAr = `عنوان تجريبي ${stamp}`;

  const headlineEnInput = page.locator('input[name="headline.en"]');
  const headlineArInput = page.locator('input[name="headline.ar"]');

  await headlineEnInput.fill(headlineEn);
  await headlineArInput.fill(headlineAr);

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();

  await expect(page.locator('input[name="headline.en"]')).toHaveValue(headlineEn);
  await expect(page.locator('input[name="headline.ar"]')).toHaveValue(headlineAr);
});
