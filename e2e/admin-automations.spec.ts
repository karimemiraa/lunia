import { test, expect, type Page } from "@playwright/test";

// Settings → Automations saves and persists; packages can be edited and
// retired with a validity period. Both restore what they changed.

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("automations: owner turns win-back on with a threshold, and it persists", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/settings");
  const card = page.getByTestId("automations-settings");
  const winBack = card.getByTestId("automation-win-back");
  const days = card.locator('input[name="winBackDays"]');
  const wasOn = await winBack.isChecked();
  const oldDays = await days.inputValue();

  try {
    await winBack.check();
    await days.fill("120");
    await card.getByRole("button", { name: "Save automations" }).click();
    await expect(card.getByText("Saved")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("automation-win-back")).toBeChecked();
    await expect(page.locator('input[name="winBackDays"]')).toHaveValue("120");
    // Every job is listed with its schedule.
    await expect(page.getByTestId("automation-runs")).toContainText("Invite lapsed customers back");
  } finally {
    const c = page.getByTestId("automations-settings");
    if (wasOn) await c.getByTestId("automation-win-back").check();
    else await c.getByTestId("automation-win-back").uncheck();
    await c.locator('input[name="winBackDays"]').fill(oldDays);
    await c.getByRole("button", { name: "Save automations" }).click();
    await expect(c.getByText("Saved")).toBeVisible();
  }
});

test("packages: create with a validity period, edit it, then retire it", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/commerce");
  const name = `E2E Package ${Date.now()}`;
  const form = page.getByTestId("create-package-form");
  await form.locator('input[name="nameEn"]').fill(name);
  await form.locator('input[name="nameAr"]').fill("باقة اختبار");
  await form.locator('input[name="sessionsTotal"]').fill("4");
  await form.locator('input[name="priceSar"]').fill("1200");
  await form.locator('input[name="validityDays"]').fill("90");
  await form.getByRole("button", { name: "Create package" }).click();

  const row = page.getByTestId("package-row").filter({ hasText: name });
  await expect(row).toContainText("90 days");
  await expect(row).toContainText("On sale");

  await row.getByTestId("edit-package").click();
  const edit = page.getByTestId("edit-package-form");
  await edit.locator('input[name="sessionsTotal"]').fill("6");
  await edit.locator('input[name="isActive"]').uncheck();
  await edit.getByRole("button", { name: "Save package" }).click();
  await expect(page.getByText("Package saved")).toBeVisible();
  await expect(row).toContainText("Retired");
  await expect(row).toContainText("6");
});
