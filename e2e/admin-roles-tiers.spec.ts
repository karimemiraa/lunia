import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("roles: toggle a permission on the marketing role and persist", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/roles");
  await expect(page.getByRole("heading", { name: "Roles & permissions" })).toBeVisible();

  // Open the marketing role's edit popup and toggle a permission.
  const card = page.locator('[data-testid="role-row"][data-role-key="marketing"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit permissions" }).click();

  const dialog = page.getByRole("dialog");
  const checkbox = dialog.getByRole("checkbox", { name: "Manage bookings (book, check-in, cancel)" });
  const wasChecked = await checkbox.isChecked();
  if (wasChecked) await checkbox.uncheck();
  else await checkbox.check();
  await dialog.getByRole("button", { name: "Save permissions" }).click();

  // The popup closes on save; reopen and confirm the change persisted.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.getByRole("button", { name: "Edit permissions" }).click();
  const reCheckbox = page.getByRole("dialog").getByRole("checkbox", { name: "Manage bookings (book, check-in, cancel)" });
  await expect(reCheckbox).toBeChecked({ checked: !wasChecked });
});

test("tiers: create a tier, see it listed, then delete it", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/tiers");
  await expect(page.getByRole("heading", { name: "Membership Tiers" })).toBeVisible();

  const stamp = Date.now();
  const key = `e2e-tier-${stamp}`;
  const name = `E2E Tier ${stamp}`;

  const createForm = page.getByTestId("create-tier-form");
  await createForm.locator('input[name="key"]').fill(key);
  await createForm.locator('input[name="name"]').fill(name);
  await createForm.locator('input[name="priority"]').fill("5");
  await createForm.locator('input[name="discountPct"]').fill("7");
  await createForm.getByRole("button", { name: "Create tier" }).click();

  await expect(createForm.getByText("Created.")).toBeVisible();

  const row = page.locator(`tr[data-testid="tier-row"][data-tier-key="${key}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByLabel(`${key} name`)).toHaveValue(name);

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete" }).click();

  await expect(page.locator(`tr[data-testid="tier-row"][data-tier-key="${key}"]`)).toHaveCount(0);
});
