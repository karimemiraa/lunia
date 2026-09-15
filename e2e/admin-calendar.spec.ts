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

// This project's three booking-flow e2e specs (site-booking.spec.ts,
// site-account.spec.ts, this file) all drive the same seeded
// services/staff/rooms, and Playwright runs different spec files in
// parallel workers by default -- so without care, two files could land a
// booking on the same date and race for the same handful of staff+room+time
// slots. Since bookings.ts now runs its create transaction at SERIALIZABLE
// isolation (see bookings.ts's createBooking, Stage 4 C1 fix), a genuine
// race there surfaces as a real "that time was just taken" failure instead
// of silently double-booking. Unlike the public wizard (capped to the next
// 14 rendered days), the walk-in form's date input takes any date directly,
// so this spec claims a genuinely far-future day -- well clear of the
// 14-day window the other two specs pick from -- eliminating any chance of
// contention with them.
const FAR_FUTURE_DAYS_OUT = 60;

function farFutureOpenDate(daysOut: number): string {
  const now = new Date();
  for (let i = daysOut; ; i++) {
    const candidate = toCenterDateISO(new Date(now.getTime() + i * 86_400_000));
    if (isSunToThu(candidate)) return candidate;
  }
}

// Picks an available walk-in slot on a dedicated far-future date (see
// FAR_FUTURE_DAYS_OUT above), falling back to a handful of subsequent open
// days only in the unlikely event that date is already fully booked.
// Returns the date that was actually booked.
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

  const targetDate = farFutureOpenDate(FAR_FUTURE_DAYS_OUT);
  await dateInput.fill(targetDate);
  if (await slotIsAvailable()) {
    await slotButton.click();
    return targetDate;
  }

  for (let i = 1; i <= 8; i++) {
    const candidate = toCenterDateISO(new Date(Date.now() + (FAR_FUTURE_DAYS_OUT + i) * 86_400_000));
    if (!isSunToThu(candidate)) continue;
    await dateInput.fill(candidate);
    if (await slotIsAvailable()) {
      await slotButton.click();
      return candidate;
    }
  }
  throw new Error(`No open walk-in slot found near ${FAR_FUTURE_DAYS_OUT} days out`);
}

test("staff calendar: front-desk walk-in booking, check-in, and complete", async ({ page }) => {
  await signInAsOwner(page);

  await page.goto("/admin/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

  // Walk-in booking now lives in a day modal opened from the toolbar button.
  await page.getByRole("link", { name: "Book walk-in" }).click();
  const walkInForm = page.getByTestId("walk-in-form");
  await expect(walkInForm).toBeVisible();

  const bookedDate = await pickFirstOpenWalkInSlot(walkInForm);

  const stamp = Date.now();
  const rand = Math.floor(100 + Math.random() * 900);
  const clientName = `E2E Walk-in Client ${stamp}`;
  // Timestamp + a random suffix: two tests (possibly in different parallel
  // workers/files) starting in the same millisecond would otherwise be able
  // to generate the identical phone number.
  const uniquePhone = `+9665${stamp.toString().slice(-8)}${rand}`;

  await walkInForm.getByLabel("Customer name").fill(clientName);
  await walkInForm.getByLabel("Customer phone").fill(uniquePhone);
  await walkInForm.getByRole("button", { name: "Confirm walk-in" }).click();

  // Confirming keeps the day modal open on the booked day (see WalkInForm.tsx),
  // so the new appointment is visible without any further navigation.
  await expect(page).toHaveURL(new RegExp(`day=${bookedDate}`));

  const row = page.locator('[data-testid="appointment-row"]', { hasText: clientName });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-booking-status", "CONFIRMED");
  await expect(row.getByText(clientName)).toBeVisible();
  await expect(row.getByText(uniquePhone)).toBeVisible();

  // Rows are compact — expand this one to reveal its actions.
  await row.getByRole("button").first().click();

  await row.getByRole("button", { name: "Check in" }).click();
  await expect(row).toHaveAttribute("data-booking-status", "CHECKED_IN", { timeout: 10_000 });

  await row.getByRole("button", { name: "Complete" }).click();
  await expect(row).toHaveAttribute("data-booking-status", "COMPLETED", { timeout: 10_000 });
});
