import { test, expect, type Page } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function openDisplay(page: Page, label: "Display" | "العرض") {
  await page.getByTestId("display-menu").getByRole("button", { name: label }).click();
  return page.getByRole("dialog", { name: label });
}

test("display: Arabic mirrors the staff shell (content stays English) and persists", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/clients");

  const panel = await openDisplay(page, "Display");
  await panel.getByRole("button", { name: "العربية" }).click();

  // The shell flips to RTL with Arabic navigation...
  const shell = page.locator('div[dir="rtl"][lang="ar"]').first();
  await expect(shell).toBeVisible();
  await expect(page.getByRole("navigation", { name: "قائمة الإدارة" }).getByRole("link", { name: "العملاء", exact: true })).toBeVisible();
  // ...while the page itself stays English/LTR until translated.
  await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible();
  await expect(page.locator('div[dir="ltr"][lang="en"]').first()).toBeVisible();

  // Persisted (cookie): still Arabic after a reload.
  await page.reload();
  await expect(page.locator('div[dir="rtl"][lang="ar"]').first()).toBeVisible();

  // Restore English so other specs see the default console.
  const back = await openDisplay(page, "العرض");
  await back.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Customers", exact: true })).toBeVisible();
});

test("display: dark theme applies immediately and persists; match device clears it", async ({ page }) => {
  await signInAsOwner(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/admin");

  const panel = await openDisplay(page, "Display");
  await panel.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");

  // Back to "match device" (light here) — the default.
  const again = await openDisplay(page, "Display");
  await again.getByRole("button", { name: "Match device" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "midnight");
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "midnight");
});
