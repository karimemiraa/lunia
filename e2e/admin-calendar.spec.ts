import { test, expect, type Page, type Locator } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// The seeded staff schedules are only active Sun-Thu (weekday 0-4 —
// prisma/seed.ts `scheduleWeekdays`), and business hours are additionally
// closed on Friday, so Fri (5) and Sat (6) never have walk-in slots even
// though the walk-in form lets you pick any date. Mirrors
// e2e/site-booking.spec.ts's isSunToThu helper.
function isSunToThu(dateISO: string): boolean {
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

function toCenterDateISO(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

// Picks the first available walk-in slot, trying the form's default date
// first and then walking forward through the next open (Sun-Thu) days if
// today has no slots left (or isn't a business day). Returns the date that
// was actually booked, since it may differ from the day the calendar page
// happened to be showing.
async function pickFirstOpenWalkInSlot(walkInForm: Locator): Promise<string> {
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

  if (await slotIsAvailable()) {
    await slotButton.click();
    return dateInput.inputValue();
  }

  const now = new Date();
  for (let i = 1; i <= 8; i++) {
    const candidate = toCenterDateISO(new Date(now.getTime() + i * 86_400_000));
    if (!isSunToThu(candidate)) continue;
    await dateInput.fill(candidate);
    if (await slotIsAvailable()) {
      await slotButton.click();
      return candidate;
    }
  }
  throw new Error("No open walk-in slot found in the next 8 days");
}

test("staff calendar: front-desk walk-in booking, check-in, and complete", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

  const walkInForm = page.getByTestId("walk-in-form");
  await expect(walkInForm).toBeVisible();

  const bookedDate = await pickFirstOpenWalkInSlot(walkInForm);

  const stamp = Date.now();
  const clientName = `E2E Walk-in Client ${stamp}`;
  const uniquePhone = `+9665${stamp.toString().slice(-8)}`;

  await walkInForm.getByLabel("Client name").fill(clientName);
  await walkInForm.getByLabel("Client phone").fill(uniquePhone);
  await walkInForm.getByRole("button", { name: "Book walk-in" }).click();

  await expect(walkInForm.getByText("Booking created.")).toBeVisible({ timeout: 10_000 });

  // Booking a walk-in on a date other than the one the calendar was showing
  // jumps the page's date filter to that day (see WalkInForm.tsx), so the
  // new appointment should now be visible without any further navigation.
  await expect(page).toHaveURL(new RegExp(`date=${bookedDate}`));

  const row = page.locator('[data-testid="appointment-row"]', { hasText: clientName });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-booking-status", "CONFIRMED");
  await expect(row.getByText(clientName)).toBeVisible();
  await expect(row.getByText(uniquePhone)).toBeVisible();

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row).toHaveAttribute("data-booking-status", "CHECKED_IN", { timeout: 10_000 });

  await row.getByRole("button", { name: "Complete" }).click();
  await expect(row).toHaveAttribute("data-booking-status", "COMPLETED", { timeout: 10_000 });
});
