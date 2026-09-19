import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("editing the home hero in admin updates the public home in both locales", async ({ page }) => {
  const stamp = Date.now();
  const headlineEn = `CMS Home EN ${stamp}`;
  const headlineAr = `واجهة ${stamp}`;

  await signInAsOwner(page);

  await page.goto("/admin/content/home");
  await expect(page.getByRole("heading", { name: "Content: Home" })).toBeVisible();

  await page.locator('input[name="headline.en"]').fill(headlineEn);
  await page.locator('input[name="headline.ar"]').fill(headlineAr);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Log out so we prove the public pages render this for anonymous visitors,
  // not just for the signed-in admin session.
  await page.context().clearCookies();

  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: headlineEn })).toBeVisible();

  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: headlineAr })).toBeVisible();
});
