import { test, expect, type Page } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("templates: studio picks a template, edits it, previews it as the customer, and saves", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/comms/templates");
  await expect(page.getByRole("heading", { name: "Message Templates", level: 1 })).toBeVisible();

  // Dropdown to choose which message to view/edit.
  const picker = page.getByTestId("template-picker");
  await expect(picker).toBeVisible();

  // Select the Arabic booking-confirmation email (value = kind|locale|channel).
  await picker.selectOption("CONFIRMATION|ar|email");

  // The email preview renders through the real branded layout in an iframe.
  const previewFrame = page.frameLocator('iframe[title="Email preview"]');
  await expect(previewFrame.getByText("LUNIA", { exact: true })).toBeVisible();
  // Sample interpolated content appears (booking reference token filled in).
  await expect(previewFrame.getByText(/LUN-4821/)).toBeVisible();

  // Edit the body; the live preview reflects the change.
  const marker = `PW-${Date.now()}`;
  const body = page.getByLabel("Template body");
  await body.fill(`${marker} {{serviceName}}`);
  await expect(previewFrame.getByText(new RegExp(marker))).toBeVisible();

  // Save creates/updates the row.
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
});
