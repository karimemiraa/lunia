import { test, expect, type Page } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
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
    "No provider configured. Messages are logged only (dev/stub).",
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

// The template studio shows one message at a time: pick it in the dropdown
// (option value "KIND|locale|channel"), then edit it in the form below.
async function openTemplate(page: Page, key: string) {
  await page.getByTestId("template-picker").selectOption(key);
  const form = page.getByTestId(`template-form-${key}`);
  await expect(form).toBeVisible();
  return form;
}

test("comms templates: edit a template body and it persists after reload", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/comms/templates");
  await expect(page.getByRole("heading", { name: "Message Templates" })).toBeVisible();

  const key = "CONFIRMATION|en|whatsapp";
  const form = await openTemplate(page, key);
  const bodyField = form.getByLabel("Template body");
  const originalBody = await bodyField.inputValue();

  const stamp = Date.now();
  const distinctiveBody = `E2E updated confirmation body {{serviceName}} at {{dateTime}} #${stamp}`;

  try {
    await bodyField.fill(distinctiveBody);

    // Ensure the template stays active: the edit form must send isActive
    // explicitly so a save can never silently flip an inactive template back
    // on (or, here, flip an active one off) -- check it stays checked.
    await expect(form.getByLabel("Active (send this template)")).toBeChecked();

    await form.getByRole("button", { name: "Save template" }).click();
    await expect(form.getByText("Saved.")).toBeVisible();

    await page.reload();

    const reloaded = await openTemplate(page, key);
    await expect(reloaded.getByLabel("Template body")).toHaveValue(distinctiveBody);
    await expect(reloaded.getByLabel("Active (send this template)")).toBeChecked();
  } finally {
    // Restore the original body so re-runs and other specs see the seeded copy.
    await page.goto("/admin/comms/templates");
    const restore = await openTemplate(page, key);
    await restore.getByLabel("Template body").fill(originalBody);
    await restore.getByRole("button", { name: "Save template" }).click();
    await expect(restore.getByText("Saved.")).toBeVisible();
  }
});

test("comms templates: deactivating a template persists isActive=false (no silent reactivation)", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/comms/templates");

  // OTP/en/sms is a real seeded row (see prisma/seed.ts), unlike
  // CONFIRMATION/en/sms which is only ever seeded on whatsapp.
  const key = "OTP|en|sms";
  const form = await openTemplate(page, key);

  const activeCheckbox = form.getByLabel("Active (send this template)");
  await expect(activeCheckbox).toBeChecked();
  await activeCheckbox.uncheck();

  await form.getByRole("button", { name: "Save template" }).click();
  await expect(form.getByText("Saved.")).toBeVisible();

  await page.reload();

  const reloaded = await openTemplate(page, key);
  await expect(reloaded.getByLabel("Active (send this template)")).not.toBeChecked();

  // Restore to active so this test doesn't leave the real OTP template
  // disabled for other runs/specs that might rely on it.
  await reloaded.getByLabel("Active (send this template)").check();
  await reloaded.getByRole("button", { name: "Save template" }).click();
  await expect(reloaded.getByText("Saved.")).toBeVisible();
});
