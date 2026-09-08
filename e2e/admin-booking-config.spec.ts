import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("rooms: create a room and see it listed", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/booking/rooms");
  await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();

  const stamp = Date.now();
  const name = `E2E Room ${stamp}`;

  const createForm = page.getByTestId("create-room-form");
  await createForm.locator('input[name="name"]').fill(name);
  await createForm.locator('input[name="capacity"]').fill("2");
  await createForm.getByRole("button", { name: "Create room" }).click();

  await expect(createForm.getByText("Created.")).toBeVisible();

  const row = page.locator(`tr[data-testid="room-row"][data-room-name="${name}"]`);
  await expect(row).toBeVisible();
  await expect(row.getByLabel(`${name} capacity`)).toHaveValue("2");

  // Leave the room deactivated rather than deleting it, so this test never
  // has to worry about the delete guard (a room can't be hard-deleted once
  // it has appointments on file).
  await row.getByLabel(`${name} active`).uncheck();
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved.")).toBeVisible();
});

test("schedules: set a staff member's weekday schedule and persist", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/booking/schedules");
  await expect(page.getByRole("heading", { name: "Staff Schedules" })).toBeVisible();

  // Select the specialist explicitly so the test doesn't depend on which
  // staff member the page defaults to.
  const picker = page.getByTestId("schedule-staff-picker");
  await picker.selectOption({ label: "Lunia Specialist" });
  await expect(page).toHaveURL(/staffUserId=/);

  const tuesdayRow = page.locator('tr[data-testid="schedule-row"][data-weekday="2"]');
  await expect(tuesdayRow).toBeVisible();

  try {
    await tuesdayRow.getByLabel("Tuesday active").check();
    await tuesdayRow.getByLabel("Tuesday start").fill("09:00");
    await tuesdayRow.getByLabel("Tuesday end").fill("17:00");

    const form = page.getByTestId("schedule-form");
    await form.getByRole("button", { name: "Save schedule" }).click();
    await expect(form.getByText("Saved.")).toBeVisible();

    await page.reload();
    const reloadedRow = page.locator('tr[data-testid="schedule-row"][data-weekday="2"]');
    await expect(reloadedRow.getByLabel("Tuesday active")).toBeChecked();
    await expect(reloadedRow.getByLabel("Tuesday start")).toHaveValue("09:00");
    await expect(reloadedRow.getByLabel("Tuesday end")).toHaveValue("17:00");
  } finally {
    // Restore the seeded baseline (Tuesday active, 10:00-20:00) so re-runs
    // and other suites (e.g. availability/booking tests) see stable data.
    const restoreRow = page.locator('tr[data-testid="schedule-row"][data-weekday="2"]');
    await restoreRow.getByLabel("Tuesday active").check();
    await restoreRow.getByLabel("Tuesday start").fill("10:00");
    await restoreRow.getByLabel("Tuesday end").fill("20:00");
    await page.getByTestId("schedule-form").getByRole("button", { name: "Save schedule" }).click();
    await expect(page.getByTestId("schedule-form").getByText("Saved.")).toBeVisible();
  }
});

test("service booking settings: edit duration/price/online-bookable via the catalog editor and persist", async ({
  page,
}) => {
  await signInAsOwner(page);

  await page.goto("/admin/catalog/services");
  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();

  // Target a known seeded service (see prisma/seed.ts) via the table's
  // search box, same convention as e2e/admin-catalog.spec.ts.
  await page.getByPlaceholder("Search services...").fill("diagnostic-skin-analysis");
  const row = page.locator("tr", { hasText: "diagnostic-skin-analysis" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: /^Service:/ })).toBeVisible();

  const editUrl = page.url();
  const durationField = page.getByLabel("Duration (min)");
  const priceField = page.getByLabel("Price (SAR)");
  const onlineCheckbox = page.getByLabel("Online bookable");

  const originalDuration = await durationField.inputValue();
  const originalPrice = await priceField.inputValue();
  const wasOnline = await onlineCheckbox.isChecked();

  try {
    await durationField.fill("45");
    await priceField.fill("199.5");
    if (wasOnline) {
      await onlineCheckbox.uncheck();
    } else {
      await onlineCheckbox.check();
    }

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Duration (min)")).toHaveValue("45");
    await expect(page.getByLabel("Price (SAR)")).toHaveValue("199.5");
    await expect(page.getByLabel("Online bookable")).toBeChecked({ checked: !wasOnline });
  } finally {
    await page.goto(editUrl);
    await page.getByLabel("Duration (min)").fill(originalDuration);
    await page.getByLabel("Price (SAR)").fill(originalPrice);
    const nowOnline = await page.getByLabel("Online bookable").isChecked();
    if (nowOnline !== wasOnline) {
      if (wasOnline) {
        await page.getByLabel("Online bookable").check();
      } else {
        await page.getByLabel("Online bookable").uncheck();
      }
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  }
});
