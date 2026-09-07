import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("site settings: update WhatsApp and Instagram and persist", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  const stamp = Date.now();
  const whatsapp = `+96650${stamp}`;
  const instagram = `lunia_e2e_${stamp}`;

  const whatsappInput = page.locator('input[name="whatsapp"]');
  const instagramInput = page.locator('input[name="instagram"]');

  await whatsappInput.fill(whatsapp);
  await instagramInput.fill(instagram);

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();

  await expect(page.locator('input[name="whatsapp"]')).toHaveValue(whatsapp);
  await expect(page.locator('input[name="instagram"]')).toHaveValue(instagram);
});
