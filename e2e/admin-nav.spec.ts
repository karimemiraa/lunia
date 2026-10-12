import { test, expect, type Page } from "@playwright/test";

// The compact sidebar: six groups, sub-pages under their parent (open when
// you're inside them), per-user pinned pages, and live counts.

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("lunia-nav-")) localStorage.removeItem(k);
  });
  await page.reload();
});

test("nav: sub-pages are tucked under their parent and open when you're inside them", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  // Top level shows the parent; its sub-pages are hidden until opened.
  await expect(nav.getByRole("link", { name: "Products & stock", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Suppliers", exact: true })).toBeHidden();

  // Opening the parent's sub-menu reveals them.
  await nav.getByTestId("nav-expand-/admin/inventory").click();
  await expect(nav.getByRole("link", { name: "Suppliers", exact: true })).toBeVisible();

  // Inside a sub-page, its branch is open and the sub-page is the current page.
  await page.goto("/admin/accounting/expenses");
  const expenses = nav.getByRole("link", { name: "Expenses", exact: true });
  await expect(expenses).toBeVisible();
  await expect(expenses).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Accounting", exact: true })).not.toHaveAttribute("aria-current", "page");
});

test("nav: pin a page to the top, and it survives a reload", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  await expect(nav.getByTestId("nav-pinned")).toHaveCount(0);
  await nav.getByRole("link", { name: "Invoices & payments", exact: true }).hover();
  await nav.getByTestId("nav-pin-/admin/billing").click();
  const pinned = nav.getByTestId("nav-pinned");
  await expect(pinned.getByRole("link", { name: "Invoices & payments" })).toBeVisible();

  await page.reload();
  await expect(nav.getByTestId("nav-pinned").getByRole("link", { name: "Invoices & payments" })).toBeVisible();

  // Unpin from the pinned section.
  await nav.getByTestId("nav-pin-pin-/admin/billing").click();
  await expect(nav.getByTestId("nav-pinned")).toHaveCount(0);
});

test("nav: groups are compact (six headers instead of ten)", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  for (const g of ["Front desk", "Finance", "Operations", "Growth", "System"]) {
    await expect(nav.getByRole("button", { name: g, exact: true })).toBeVisible();
  }
  for (const old of ["Scheduling", "Inventory", "Commerce", "Marketing", "Content"]) {
    await expect(nav.getByRole("button", { name: old, exact: true })).toHaveCount(0);
  }
});
