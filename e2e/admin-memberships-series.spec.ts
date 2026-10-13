import { test, expect, type Page, type Locator } from "@playwright/test";

// Paid memberships (plan → enrol → pause/resume → cancel) and recurring
// appointment series (repeat → check dates → book → cancel this and following).

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// Invoices can only be issued once the clinic's tax details are complete; a
// fresh local database has none, so fill them in once (left as-is if set).
async function ensureTaxSettings(page: Page) {
  await page.goto("/admin/billing/settings");
  const vat = page.getByLabel("VAT registration number");
  if ((await vat.inputValue()).trim()) return;
  await page.getByLabel("Legal name (Arabic)").fill("مركز لونيا");
  await page.getByLabel("Legal name (English)").fill("Lunia Center");
  await vat.fill("300000000000003");
  await page.getByLabel("Commercial registration (CR) no.").fill("1010000000");
  await page.getByLabel("Building number").fill("1234");
  await page.getByLabel("Street").fill("Prince Sultan Rd");
  await page.getByLabel("District").fill("Al Olaya");
  await page.getByLabel("City").fill("Riyadh");
  await page.getByLabel("Postal code").fill("12345");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

async function addCustomer(page: Page, name: string, phone: string) {
  await page.goto("/admin/clients?add=lead");
  const form = page.getByTestId("add-lead-form");
  await form.locator('input[name="fullName"]').fill(name);
  await form.locator('input[name="phone"]').fill(phone);
  await form.getByRole("button", { name: "Add lead" }).click();
  await expect(form).toBeHidden();
}

test("memberships: create a plan, enrol a customer, pause, resume and cancel", async ({ page }) => {
  await signInAsOwner(page);
  await ensureTaxSettings(page);
  const stamp = Date.now();
  const planName = `E2E Glow Club ${stamp}`;
  const customer = `E2E Member ${stamp}`;
  await addCustomer(page, customer, `+96655${String(stamp).slice(-7)}`);

  await page.goto("/admin/memberships");
  await page.getByTestId("new-plan").click();
  const planForm = page.getByTestId("plan-form");
  await planForm.locator('input[name="nameEn"]').fill(planName);
  await planForm.locator('input[name="nameAr"]').fill("نادي النضارة");
  await planForm.locator('input[name="priceSar"]').fill("499");
  await planForm.locator('input[name="serviceDiscountPct"]').fill("10");
  await planForm.locator('input[name="includedSessions"]').fill("1");
  await planForm.getByRole("button", { name: "Create plan" }).click();
  const card = page.getByTestId("plan-card").filter({ hasText: planName });
  await expect(card).toContainText("10% off treatments");
  await expect(card).toContainText("1 session(s) included each month");

  const enrol = page.getByTestId("enrol-form");
  await enrol.getByTestId("enrol-customer-search").fill(customer);
  await enrol.getByTestId("enrol-customer-hit").filter({ hasText: customer }).click();
  await enrol.getByTestId("enrol-plan").selectOption({ label: `${planName} — 499 SAR/month` });
  await enrol.getByTestId("enrol-submit").click();
  await expect(page.getByText("Enrolled")).toBeVisible();

  const row = page.getByTestId("member-row").filter({ hasText: customer });
  await expect(row).toContainText("Active");
  await expect(row).toContainText("Unpaid invoice");

  await row.getByTestId("member-pause").click();
  await expect(row).toContainText("Paused");
  await row.getByTestId("member-resume").click();
  await expect(row).toContainText("Active");

  await row.getByRole("button", { name: "Cancel now" }).click();
  await page.getByRole("button", { name: "Cancel now" }).last().click();
  await expect(row).toBeHidden();

  // Retire the test plan so it isn't offered.
  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByTestId("plan-form").locator('input[name="isActive"]').uncheck();
  await page.getByTestId("plan-form").getByRole("button", { name: "Save plan" }).click();
  await expect(card).toContainText("Not offered");
});

function isSunToThu(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return d <= 4;
}
const riyadhISO = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function pickSlotFarOut(form: Locator, daysOut: number): Promise<string> {
  const dateInput = form.locator('input[type="date"]');
  const slot = form.locator("[data-slot-time]").first();
  for (let i = 0; i < 14; i++) {
    const iso = riyadhISO(new Date(Date.now() + (daysOut + i) * 86_400_000));
    if (!isSunToThu(iso)) continue;
    await dateInput.fill(iso);
    await Promise.race([slot.waitFor({ timeout: 10_000 }).catch(() => {}), form.getByText("No available times on this day.").waitFor({ timeout: 10_000 }).catch(() => {})]);
    if ((await slot.count()) > 0) {
      await slot.click();
      return iso;
    }
  }
  throw new Error("No open slot found");
}

test("recurring series: preview the dates, book a course, cancel this and following", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto("/admin/calendar");
  await page.getByRole("link", { name: "Book walk-in" }).click();
  const form = page.getByTestId("walk-in-form");
  // ~9 months out: clear of every other spec's booking windows.
  const firstDate = await pickSlotFarOut(form, 270 + Math.floor(Math.random() * 40));

  await form.getByTestId("repeat-toggle").check();
  await form.getByTestId("repeat-interval").selectOption("1");
  await form.getByTestId("repeat-count").fill("3");
  await form.getByTestId("repeat-check").click();
  const preview = form.getByTestId("repeat-preview");
  await expect(preview.locator("li")).toHaveCount(3);

  const name = `E2E Series ${Date.now()}`;
  await form.getByLabel("Customer name").fill(name);
  await form.getByLabel("Customer phone").fill(`+96656${String(Date.now()).slice(-7)}`);
  await form.getByRole("button", { name: /^Book \d visits$/ }).click();
  await expect(page).toHaveURL(new RegExp(`day=${firstDate}`));

  const row = page.locator('[data-testid="appointment-row"]', { hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText("Series", { exact: true })).toBeVisible();
  await row.getByRole("button").first().click();
  await row.getByTestId("cancel-series").click();
  await page.getByRole("button", { name: "Cancel series" }).click();
  await expect(row).toHaveAttribute("data-booking-status", "CANCELLED", { timeout: 10_000 });
});
