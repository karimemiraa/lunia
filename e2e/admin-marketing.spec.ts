import { test, expect, type Page } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// Seed/test data may leave the marketing dashboard's numbers small or zero,
// so this spec asserts on structure (headings/sections/table shape present),
// never on specific CAC/revenue/traffic values -- except for the one row we
// add ourselves via the campaign spend form, which we assert appears intact.
test("marketing dashboard: owner sees CAC by channel, conversion, and traffic sources", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/marketing");
  await expect(page.getByRole("heading", { name: "Marketing & Growth", exact: true, level: 1 })).toBeVisible();

  // CAC by channel: table + bar chart. The section heading (h2) and the bar
  // chart's own title (h3) share the same text, so disambiguate by level.
  await expect(page.getByRole("heading", { name: "CAC by Channel", level: 2 })).toBeVisible();
  await expect(page.getByTestId("cac-table")).toBeVisible();
  await expect(page.getByTestId("cac-table").getByRole("columnheader", { name: "CAC" })).toBeVisible();
  await expect(page.getByRole("img", { name: /CAC by Channel/ })).toBeVisible();

  // Best channels callout.
  await expect(page.getByRole("heading", { name: "Best Channels" })).toBeVisible();
  await expect(page.getByText("Lowest CAC", { exact: true })).toBeVisible();
  await expect(page.getByText("Highest Avg LTV", { exact: true })).toBeVisible();

  // New vs returning.
  await expect(page.getByRole("heading", { name: "New vs Returning" })).toBeVisible();
  await expect(page.getByText("New Customers", { exact: true })).toBeVisible();
  await expect(page.getByText("Returning Bookings", { exact: true })).toBeVisible();

  // Booking conversion.
  await expect(page.getByRole("heading", { name: "Booking Conversion" })).toBeVisible();
  await expect(page.getByText("Sessions Started Booking", { exact: true })).toBeVisible();
  await expect(page.getByText("Conversion Rate", { exact: true })).toBeVisible();

  // Traffic sources: table + bar chart.
  await expect(page.getByRole("heading", { name: "Traffic Sources", exact: true })).toBeVisible();
  await expect(page.getByTestId("traffic-sources-table")).toBeVisible();
  await expect(page.getByRole("img", { name: /Traffic Sources \(Views\)/ })).toBeVisible();

  // Top pages.
  await expect(page.getByRole("heading", { name: "Top Pages" })).toBeVisible();
  await expect(page.getByTestId("top-pages-table")).toBeVisible();

  // Top clients by LTV.
  await expect(page.getByRole("heading", { name: "Top Clients by Lifetime Value" })).toBeVisible();
  await expect(page.getByTestId("top-clients-table")).toBeVisible();

  // The "Marketing" nav link is present (ANALYTICS_VIEW-gated) and points here.
  await expect(page.getByRole("link", { name: "Campaigns", exact: true })).toHaveAttribute("href", "/admin/marketing");

  // Owner also has MARKETING_MANAGE, so the campaigns link is offered here.
  await expect(page.getByRole("link", { name: "Manage campaign spend" })).toHaveAttribute(
    "href",
    "/admin/marketing/campaigns",
  );
});

test("campaign spend: add a spend row and see it listed", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/marketing/campaigns");
  await expect(page.getByRole("heading", { name: "Campaign Spend", exact: true, level: 1 })).toBeVisible();

  const stamp = Date.now();
  const channel = `e2e-channel-${stamp}`;
  const now = new Date();
  const periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const form = page.getByTestId("campaign-spend-form");
  await form.locator('input[name="channel"]').fill(channel);
  await form.locator('input[name="periodMonth"]').fill(periodMonth);
  await form.locator('input[name="amountSar"]').fill("1500.50");
  await form.locator('input[name="note"]').fill("E2E spend row");
  await form.getByRole("button", { name: "Save spend" }).click();

  await expect(form.getByText("Saved.")).toBeVisible();

  const row = page.locator(`tr[data-testid="campaign-spend-row"][data-channel="${channel}"][data-period="${periodMonth}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("1,500.50 SAR");
  await expect(row).toContainText("E2E spend row");
});
