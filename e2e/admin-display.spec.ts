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

test("display: Arabic switches the whole console to Arabic/RTL and persists", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/clients");

  const panel = await openDisplay(page, "Display");
  await panel.getByRole("button", { name: "العربية" }).click();

  // The whole document flips to Arabic/RTL: navigation and page content.
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("navigation", { name: "قائمة الإدارة" }).getByRole("link", { name: "العملاء", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "العملاء", level: 1 })).toBeVisible();

  // Persisted (cookie): still Arabic after a reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // Restore English so other specs see the default console.
  const back = await openDisplay(page, "العرض");
  await back.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Customers", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
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
