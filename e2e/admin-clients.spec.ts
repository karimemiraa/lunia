import { test, expect, type Page, type Locator } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// The seeded staff schedules are only active Sun-Thu (weekday 0-4 --
// prisma/seed.ts `scheduleWeekdays`), and business hours are additionally
// closed on Friday, so Fri (5) and Sat (6) never have walk-in slots even
// though the walk-in form lets you pick any date. Mirrors
// e2e/admin-calendar.spec.ts's isSunToThu helper.
function isSunToThu(dateISO: string): boolean {
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

function toCenterDateISO(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

// This spec creates its client via a far-future walk-in booking (see
// admin-calendar.spec.ts for the rationale) so it never contends with the
// other booking-flow specs for the same near-term slots.
const FAR_FUTURE_DAYS_OUT = 90;

function farFutureOpenDate(daysOut: number): string {
  const now = new Date();
  for (let i = daysOut; ; i++) {
    const candidate = toCenterDateISO(new Date(now.getTime() + i * 86_400_000));
    if (isSunToThu(candidate)) return candidate;
  }
}

async function pickFirstOpenWalkInSlot(walkInForm: Locator): Promise<void> {
  const dateInput = walkInForm.locator('input[type="date"]');
  const slotButton = walkInForm.locator("[data-slot-time]").first();
  const noSlotsMessage = walkInForm.getByText("No available times on this day.");

  async function slotIsAvailable(): Promise<boolean> {
    await Promise.race([
      slotButton.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
      noSlotsMessage.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
    ]);
    return (await slotButton.count()) > 0;
  }

  const targetDate = farFutureOpenDate(FAR_FUTURE_DAYS_OUT);
  await dateInput.fill(targetDate);
  if (await slotIsAvailable()) {
    await slotButton.click();
    return;
  }

  for (let i = 1; i <= 8; i++) {
    const candidate = toCenterDateISO(new Date(Date.now() + (FAR_FUTURE_DAYS_OUT + i) * 86_400_000));
    if (!isSunToThu(candidate)) continue;
    await dateInput.fill(candidate);
    if (await slotIsAvailable()) {
      await slotButton.click();
      return;
    }
  }
  throw new Error(`No open walk-in slot found near ${FAR_FUTURE_DAYS_OUT} days out`);
}

// Creates a brand-new client deterministically via the calendar's walk-in
// booking form (the simplest reliable path to a real ClientProfile row --
// see admin-calendar.spec.ts's staff walk-in test, which exercises the same
// find-or-create-client path in bookings.ts). Returns the unique name/phone
// so the clients spec can search for exactly this client.
async function createClientViaWalkIn(page: Page): Promise<{ name: string; phone: string }> {
  await page.goto("/admin/calendar");
  const walkInForm = page.getByTestId("walk-in-form");
  await expect(walkInForm).toBeVisible();

  await pickFirstOpenWalkInSlot(walkInForm);

  const stamp = Date.now();
  const rand = Math.floor(100 + Math.random() * 900);
  const name = `E2E CRM Client ${stamp}`;
  const phone = `+9664${stamp.toString().slice(-8)}${rand}`;

  await walkInForm.getByLabel("Client name").fill(name);
  await walkInForm.getByLabel("Client phone").fill(phone);
  await walkInForm.getByRole("button", { name: "Book walk-in" }).click();
  await expect(walkInForm.getByText("Booking created.")).toBeVisible({ timeout: 10_000 });

  return { name, phone };
}

test("clients: search creates client appears, add visit note, and edit tier persists", async ({ page }) => {
  await signInAsOwner(page);

  const { name, phone } = await createClientViaWalkIn(page);

  await page.goto("/admin/clients");
  await expect(page.getByRole("heading", { name: "Clients", level: 1 })).toBeVisible();

  const filterForm = page.getByTestId("clients-filter-form");
  await filterForm.getByLabel("Search").fill(phone);
  await filterForm.getByRole("button", { name: "Filter" }).click();

  const row = page.locator('[data-testid="client-row"]', { hasText: phone });
  await expect(row).toBeVisible();
  await expect(row.getByText(name)).toBeVisible();

  await row.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // Add a visit note.
  const noteBody = `E2E visit note ${Date.now()}`;
  const noteForm = page.getByTestId("visit-note-form");
  await noteForm.getByLabel("Add visit note").fill(noteBody);
  await noteForm.getByRole("button", { name: "Add note" }).click();
  await expect(noteForm.getByText("Note added.")).toBeVisible();

  const noteItem = page.locator('[data-testid="visit-note"]', { hasText: noteBody });
  await expect(noteItem).toBeVisible();
  // The seeded owner's staff profile is named "Lunia Owner" (prisma/seed.ts).
  await expect(noteItem.getByText("Lunia Owner")).toBeVisible();

  // Edit the tier and confirm it persists across a reload.
  const tierEditor = page.getByTestId("tier-editor");
  await expect(tierEditor).toBeVisible();
  const tierSelect = tierEditor.locator("select[name='tierId']");
  const options = await tierSelect.locator("option").allTextContents();
  // Prefer a tier that is neither the "no membership" placeholder nor the
  // base Guest tier, so the assertion below is unambiguous evidence that a
  // real membership was assigned and persisted (not just left at baseline).
  const targetTierName =
    options.find((label) => label !== "No tier (guest)" && label !== "Guest") ??
    options.find((label) => label !== "No tier (guest)");
  test.skip(!targetTierName, "No membership tier is seeded to assign.");

  await tierSelect.selectOption({ label: targetTierName! });
  await tierEditor.getByRole("button", { name: "Save tier" }).click();
  await expect(tierEditor.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("current-tier")).toHaveText(targetTierName!);
  await expect(page.getByTestId("tier-editor").locator("select[name='tierId'] option:checked")).toHaveText(targetTierName!);

  // Deleting the note we just added exercises the delete-own path (owner is
  // both the author and holds CLIENT_MANAGE here, but the button reflects
  // the same UI either way).
  page.once("dialog", (dialog) => dialog.accept());
  await noteItem.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator('[data-testid="visit-note"]', { hasText: noteBody })).toHaveCount(0);
});
