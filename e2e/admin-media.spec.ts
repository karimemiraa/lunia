import { test, expect } from "@playwright/test";

// Smallest possible valid PNG: a 1x1 transparent pixel.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("media library: upload, edit alt text, and delete", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();

  const itemsBefore = await page.getByTestId("media-item").count();

  // Upload a tiny fixture PNG via the file input.
  await page.setInputFiles('input[name="file"]', {
    name: `e2e-fixture-${Date.now()}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  await expect(page.getByTestId("media-item")).toHaveCount(itemsBefore + 1);

  // The newest upload is listed first (listMedia orders by createdAt desc).
  const newItem = page.getByTestId("media-item").first();
  await expect(newItem.locator("img")).toBeVisible();

  // Set alt text and confirm it persists after reload.
  const altEnInput = newItem.locator('input[name="altEn"]');
  const altArInput = newItem.locator('input[name="altAr"]');
  await altEnInput.fill("A test swatch");
  await altArInput.fill("عينة اختبار");
  await newItem.getByRole("button", { name: "Save alt text" }).click();

  await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();
  const updatedItem = page.getByTestId("media-item").first();
  await expect(updatedItem.locator('input[name="altEn"]')).toHaveValue("A test swatch");
  await expect(updatedItem.locator('input[name="altAr"]')).toHaveValue("عينة اختبار");

  // Delete it and confirm it's removed from the grid.
  page.once("dialog", (dialog) => dialog.accept());
  await updatedItem.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByTestId("media-item")).toHaveCount(itemsBefore);
});
