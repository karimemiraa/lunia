import { test, expect, type Page } from "@playwright/test";

// The seeded staff schedules are only active Sun-Thu (weekday 0-4 —
// prisma/seed.ts `scheduleWeekdays`), and business hours are additionally
// closed on Friday. So Fri (5) has no slots (closed) and Sat (6) has no
// slots either (no staff scheduled), even though the center is technically
// "open" that day. Rather than re-deriving the wizard's own center-local
// ("Asia/Riyadh") date math here (which could drift from it near a UTC day
// boundary), this reads the date buttons the wizard actually rendered and
// tries the Sun-Thu ones in order until one has an open slot.
function isSunToThu(dateISO: string): boolean {
  // Parsed at UTC noon so the fixed +3h center offset never rolls the
  // calendar day — noon UTC is always the same civil date in Riyadh.
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

// This project's three booking-flow e2e specs (this file,
// site-account.spec.ts, admin-calendar.spec.ts) all drive the same seeded
// services/staff/rooms, and Playwright runs different spec files in
// parallel workers by default -- so without care, two files could land a
// booking on the same date and race for the same handful of staff+room+time
// slots. Since bookings.ts now runs its create transaction at SERIALIZABLE
// isolation (see bookings.ts's createBooking, Stage 4 C1 fix), a genuine
// race there surfaces as a real "that time was just taken" failure instead
// of silently double-booking. Each spec/test in that trio is pinned to its
// own dedicated weekday, so they can never contend for the same day's
// slots regardless of how many workers run them concurrently or how many
// times the suite is re-run. This file claims Thursday; the wizard only
// renders the next 14 days, so the *farthest* Thursday within that window
// is preferred (falling back to any other open day only if that Thursday
// is unexpectedly fully booked).
const TARGET_WEEKDAY = 4; // Thursday

async function selectFirstOpenSlot(page: Page) {
  const dayButtons = page.locator("button[data-date]");
  await expect(dayButtons.first()).toBeVisible();
  const dateAttrs = await dayButtons.evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
  const allOpenDates = dateAttrs.filter((d): d is string => !!d && isSunToThu(d));
  expect(allOpenDates.length).toBeGreaterThan(0);

  const targetDates = allOpenDates
    .filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === TARGET_WEEKDAY)
    .sort()
    .reverse();
  const otherDates = allOpenDates.filter((d) => !targetDates.includes(d));
  const candidateDates = [...targetDates, ...otherDates];

  for (const dateISO of candidateDates) {
    await page.locator(`button[data-date="${dateISO}"]`).click();

    const slotsContainer = page.getByTestId("booking-slots");
    const noSlotsMessage = page.getByText(/no times are available|ما فيه أوقات متاحة/i);
    await Promise.race([
      slotsContainer.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
      noSlotsMessage.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
    ]);

    const firstSlot = slotsContainer.locator("button[data-slot-time]").first();
    if (await firstSlot.count()) {
      await firstSlot.click();
      return;
    }
  }
  throw new Error("No open slot found among the rendered Sun-Thu dates");
}

// Timestamp + a random suffix: two tests (possibly in different parallel
// workers/files) starting in the same millisecond would otherwise be able
// to generate the identical phone number.
function uniquePhone(prefix: string): string {
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}${Date.now().toString().slice(-8)}${rand}`;
}

function uniqueEmail(): string {
  const rand = Math.floor(100 + Math.random() * 900);
  return `e2e.booking.${Date.now().toString().slice(-8)}${rand}@example.com`;
}

test.describe("public booking flow", () => {
  test("en: pick a service, date/time, verify by OTP, and confirm the booking", async ({ page }) => {
    await page.goto("/en/book");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(page).toHaveTitle(/.+/);

    // Step 1: pick a service (the first bookable, ungated service seeded —
    // "Diagnostic Skin Analysis").
    const firstService = page.locator("button[data-service-id]").first();
    await expect(firstService).toBeVisible();
    await firstService.click();

    await expect(page.getByTestId("booking-step-datetime")).toBeVisible();

    // Step 2: pick a date the center is open (Sun-Thu) and its first slot.
    await selectFirstOpenSlot(page);
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: contact details + OTP.
    await expect(page.getByTestId("booking-step-contact")).toBeVisible();
    const phone = uniquePhone("+9665");
    await page.getByLabel("Full name").fill("Sarah Booking Test");
    await page.getByLabel("Phone or email").fill(phone);
    await page.getByRole("button", { name: "Send verification code" }).click();

    const devCodeEl = page.getByTestId("dev-otp-code");
    await expect(devCodeEl).toBeVisible({ timeout: 10_000 });
    const devCodeText = await devCodeEl.textContent();
    const code = devCodeText?.match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();

    await page.getByLabel("Verification code").fill(code!);
    await page.getByRole("button", { name: "Confirm booking" }).click();

    // Step 4: success screen shows the booking.
    await expect(page.getByTestId("booking-step-success")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
    await expect(page.getByText("Diagnostic Skin Analysis")).toBeVisible();
  });

  test("en: identify by email instead of phone at the contact step", async ({ page }) => {
    await page.goto("/en/book");

    const firstService = page.locator("button[data-service-id]").first();
    await expect(firstService).toBeVisible();
    await firstService.click();

    await expect(page.getByTestId("booking-step-datetime")).toBeVisible();
    await selectFirstOpenSlot(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByTestId("booking-step-contact")).toBeVisible();
    const email = uniqueEmail();
    await page.getByLabel("Full name").fill("Email Booking Test");
    await page.getByLabel("Phone or email").fill(email);
    await page.getByRole("button", { name: "Send verification code" }).click();

    const devCodeEl = page.getByTestId("dev-otp-code");
    await expect(devCodeEl).toBeVisible({ timeout: 10_000 });
    const devCodeText = await devCodeEl.textContent();
    const code = devCodeText?.match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();

    await page.getByLabel("Verification code").fill(code!);
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page.getByTestId("booking-step-success")).toBeVisible({ timeout: 10_000 });
  });

  test("en: the site header Book Now CTA links to /book", async ({ page }) => {
    await page.goto("/en");
    const bookLink = page.getByRole("link", { name: "Book Now" }).first();
    await expect(bookLink).toHaveAttribute("href", "/en/book");
  });
});

test.describe("public booking flow (ar spot-check)", () => {
  test("ar: /book renders rtl with a single h1 and a service picker", async ({ page }) => {
    await page.goto("/ar/book");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);

    const firstService = page.locator("button[data-service-id]").first();
    await expect(firstService).toBeVisible();
  });

  test("ar: the site header booking CTA links to /book", async ({ page }) => {
    await page.goto("/ar");
    const bookLink = page.getByRole("link", { name: "احجزي الآن" }).first();
    await expect(bookLink).toHaveAttribute("href", "/ar/book");
  });
});
