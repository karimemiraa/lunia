import { test, expect, type Page } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("comms: provider status shows logged-only in dev, log table renders, no secrets leak", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/comms");
  await expect(page.getByRole("heading", { name: "Communications" })).toBeVisible();

  // Dev/CI never sets COMMS_PROVIDER creds, so getCommsConfig() resolves to
  // provider "none" -- the panel must say so, not print any provider name.
  const statusPanel = page.getByTestId("comms-provider-status");
  await expect(statusPanel).toBeVisible();
  await expect(page.getByTestId("comms-provider-none")).toHaveText(
    "No provider configured — messages are logged only (dev/stub).",
  );

  // No secret-shaped value should ever be rendered anywhere on the page.
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/AC[0-9a-fA-F]{10,}/); // Twilio account SID shape
  expect(bodyText.toLowerCase()).not.toContain("authtoken");
  expect(bodyText.toLowerCase()).not.toContain("appsid");

  // The CommunicationLog table renders (structure asserted regardless of
  // whether any rows exist yet).
  const logSection = page.getByTestId("comms-log-section");
  await expect(logSection).toBeVisible();
  await expect(page.getByTestId("comms-log-table")).toBeVisible();
  await expect(logSection.locator("table")).toBeVisible();
  await expect(logSection.locator("thead")).toContainText("Channel");
  await expect(logSection.locator("thead")).toContainText("Status");
});

test("comms templates: edit a template body and it persists after reload", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/comms/templates");
  await expect(page.getByRole("heading", { name: "Message Templates" })).toBeVisible();

  const card = page.getByTestId("template-CONFIRMATION-en-whatsapp");
  await expect(card).toBeVisible();

  const stamp = Date.now();
  const distinctiveBody = `E2E updated confirmation body {{serviceName}} at {{dateTime}} #${stamp}`;

  const bodyField = card.getByLabel("CONFIRMATION en whatsapp body");
  await bodyField.fill(distinctiveBody);

  // Ensure the template stays active: the edit form must send isActive
  // explicitly so a save can never silently flip an inactive template back
  // on (or, here, flip an active one off) -- check it stays checked.
  const activeCheckbox = card.getByLabel("CONFIRMATION en whatsapp active");
  await expect(activeCheckbox).toBeChecked();

  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.reload();

  const reloadedCard = page.getByTestId("template-CONFIRMATION-en-whatsapp");
  await expect(reloadedCard.getByLabel("CONFIRMATION en whatsapp body")).toHaveValue(distinctiveBody);
  await expect(reloadedCard.getByLabel("CONFIRMATION en whatsapp active")).toBeChecked();
});

test("comms templates: deactivating a template persists isActive=false (no silent reactivation)", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/comms/templates");

  // OTP/en/sms is a real seeded row (see prisma/seed.ts), unlike
  // CONFIRMATION/en/sms which is only ever seeded on whatsapp.
  const card = page.getByTestId("template-OTP-en-sms");
  await expect(card).toBeVisible();

  const activeCheckbox = card.getByLabel("OTP en sms active");
  await expect(activeCheckbox).toBeChecked();
  await activeCheckbox.uncheck();

  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();

  await page.reload();

  const reloadedCard = page.getByTestId("template-OTP-en-sms");
  await expect(reloadedCard.getByLabel("OTP en sms active")).not.toBeChecked();

  // Restore to active so this test doesn't leave the real OTP template
  // disabled for other runs/specs that might rely on it.
  await reloadedCard.getByLabel("OTP en sms active").check();
  await reloadedCard.getByRole("button", { name: "Save" }).click();
  await expect(reloadedCard.getByText("Saved.")).toBeVisible();
});
