import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
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

test("site settings: update the OTP channel default and persist (A4)", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/settings");
  await expect(page.getByTestId("communications-settings")).toBeVisible();

  const otpSelect = page.getByTestId("otp-channel-select");
  await expect(otpSelect).toBeVisible();
  // The default booking channel is now an editable select (was read-only).
  await expect(page.getByTestId("booking-channel-select")).toBeVisible();

  const original = await otpSelect.inputValue();
  const target = original === "EMAIL" ? "SMS" : "EMAIL";
  try {
    await otpSelect.selectOption(target);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("otp-channel-select")).toHaveValue(target);
  } finally {
    // Restore: the OTP channel also restricts the website login identifier, so
    // leaving it changed would break the public sign-in specs on the next run.
    await page.goto("/admin/settings");
    await page.getByTestId("otp-channel-select").selectOption(original);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  }
});
