import { test, expect, type Page } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// Seed data may leave the business dashboard's numbers small or zero, so
// this spec only asserts on structure (labels/sections present), never on
// specific revenue/booking counts.
test("business dashboard: owner sees revenue, top services, and new/returning breakdown", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: "Business Dashboard", exact: true })).toBeVisible();

  // Revenue stat cards for the three periods.
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
  await expect(page.getByText("This Week", { exact: true })).toBeVisible();
  await expect(page.getByText("This Month", { exact: true })).toBeVisible();

  // Bookings + upcoming.
  await expect(page.getByText("Total Bookings (This Month)")).toBeVisible();
  await expect(page.getByText("Upcoming Appointments")).toBeVisible();

  // New vs returning section.
  await expect(page.getByRole("heading", { name: "New vs Returning Customers (This Month)" })).toBeVisible();
  await expect(page.getByText("New Customers", { exact: true })).toBeVisible();
  await expect(page.getByText("Returning Bookings", { exact: true })).toBeVisible();

  // Top services chart section (accessible region carries the data summary
  // via aria-label, so assert via its accessible name rather than raw text).
  await expect(page.getByRole("heading", { name: "Top Services (This Month)" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Top Services \(This Month\)/ })).toBeVisible();

  // Revenue-by-day line chart section.
  await expect(page.getByRole("heading", { name: /Revenue.*Last 30 Days/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Revenue.*Last 30 Days/ })).toBeVisible();

  // The "Business" nav link is present (ANALYTICS_VIEW-gated) and points here.
  await expect(page.getByRole("link", { name: "Business" })).toHaveAttribute("href", "/admin/dashboard");
});
