import { test, expect, type Page } from "@playwright/test";

// This project's three booking-flow e2e specs (site-booking.spec.ts, this
// file, admin-calendar.spec.ts) all drive the same seeded
// services/staff/rooms, and Playwright runs different spec files in
// parallel workers by default -- so without care, two files could land a
// booking on the same date and race for the same handful of staff+room+time
// slots. Since bookings.ts now runs its create transaction at SERIALIZABLE
// isolation (see bookings.ts's createBooking, Stage 4 C1 fix), a genuine
// race there surfaces as a real "that time was just taken" failure instead
// of silently double-booking. Each spec/test in that trio is pinned to its
// own dedicated weekday, so they can never contend for the same day's
// slots regardless of how many workers run them concurrently or how many
// times the suite is re-run. The public wizard only renders the next 14
// days, so the *farthest* occurrence of the dedicated weekday within that
// window is preferred (falling back to any other open day, still meeting
// the `minHours` floor, only if that day is unexpectedly fully booked).
// This file's two booking tests (en, ar) each claim their own weekday so
// they can't contend with each other either, even though they run
// sequentially within this file.
const EN_TEST_WEEKDAY = 3; // Wednesday
const AR_TEST_WEEKDAY = 2; // Tuesday

// Selects a service-1 slot that starts at least `minHours` from now,
// preferring the farthest occurrence of `preferredWeekday` among the
// rendered day buttons and reading each slot's real `data-slot-time` ISO
// timestamp rather than assuming anything about the seeded schedule or the
// time of day the suite happens to run at. This lets the account e2e test
// create a booking guaranteed to be well outside the 24h cancellation
// window, regardless of when/where it runs.
async function selectSlotAtLeastHoursAhead(page: Page, minHours: number, preferredWeekday: number): Promise<string> {
  const dayButtons = page.locator("button[data-date]");
  await expect(dayButtons.first()).toBeVisible();
  const dateAttrs = await dayButtons.evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
  const allDates = dateAttrs.filter((d): d is string => !!d);
  expect(allDates.length).toBeGreaterThan(0);

  const preferredDates = allDates
    .filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === preferredWeekday)
    .sort()
    .reverse();
  const otherDates = allDates.filter((d) => !preferredDates.includes(d));
  const candidateDates = [...preferredDates, ...otherDates];

  for (const dateISO of candidateDates) {
    await page.locator(`button[data-date="${dateISO}"]`).click();

    const slotsContainer = page.getByTestId("booking-slots");
    const noSlotsMessage = page.getByText(/no times are available|ما فيه أوقات متاحة/i);
    await Promise.race([
      slotsContainer.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
      noSlotsMessage.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {}),
    ]);

    const slotButtons = slotsContainer.locator("button[data-slot-time]");
    const count = await slotButtons.count();
    if (count === 0) continue;

    const times = await slotButtons.evaluateAll((els) => els.map((el) => el.getAttribute("data-slot-time")));
    const now = Date.now();
    for (let i = 0; i < times.length; i++) {
      const iso = times[i];
      if (!iso) continue;
      const hoursAhead = (new Date(iso).getTime() - now) / (60 * 60 * 1000);
      if (hoursAhead >= minHours) {
        await slotButtons.nth(i).click();
        return iso;
      }
    }
  }
  throw new Error(`No open slot found at least ${minHours}h ahead across the rendered dates`);
}

// Timestamp + a random suffix: two tests (possibly in different parallel
// workers/files) starting in the same millisecond would otherwise be able
// to generate the identical phone number.
function uniquePhone(prefix: string): string {
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}${Date.now().toString().slice(-8)}${rand}`;
}

// Books an appointment for `phone` at least 30h out (comfortably clear of
// the 24h cancellation cutoff) via the public wizard, on `preferredWeekday`
// where possible (see EN_TEST_WEEKDAY/AR_TEST_WEEKDAY above), verifying by
// the dev-mode OTP code. Ends on the wizard's success screen.
async function bookFarOutAppointment(page: Page, phone: string, preferredWeekday: number) {
  await page.goto("/en/book");

  const firstService = page.locator("button[data-service-id]").first();
  await expect(firstService).toBeVisible();
  await firstService.click();

  await expect(page.getByTestId("booking-step-datetime")).toBeVisible();
  await selectSlotAtLeastHoursAhead(page, 30, preferredWeekday);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("booking-step-contact")).toBeVisible();
  await page.getByLabel("Full name").fill("Account Test Client");
  await page.getByLabel("Phone or email").fill(phone);
  await page.getByRole("button", { name: "Send verification code" }).click();

  const devCodeEl = page.getByTestId("dev-otp-code");
  await expect(devCodeEl).toBeVisible({ timeout: 10_000 });
  const code = (await devCodeEl.textContent())?.match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();

  await page.getByLabel("Verification code").fill(code!);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByTestId("booking-step-success")).toBeVisible({ timeout: 10_000 });
}

// Signs in at /account/login with `phone`, reading the dev-mode OTP code off
// the page rather than a real SMS. Ends on /account.
async function loginAtAccountPage(page: Page, locale: "en" | "ar", phone: string) {
  await page.goto(`/${locale}/account/login`);
  await page.getByLabel(locale === "ar" ? "الجوال أو البريد الإلكتروني" : "Phone or email").fill(phone);
  await page.getByRole("button", { name: locale === "ar" ? "إرسال رمز التأكيد" : "Send verification code" }).click();

  const devCodeEl = page.getByTestId("dev-otp-code");
  await expect(devCodeEl).toBeVisible({ timeout: 10_000 });
  const code = (await devCodeEl.textContent())?.match(/\d{6}/)?.[0];
  expect(code).toBeTruthy();

  await page.getByLabel(locale === "ar" ? "رمز التأكيد" : "Verification code").fill(code!);
  await page.getByRole("button", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`), { timeout: 10_000 });
}

test.describe("client account area", () => {
  test("en: book a far-out appointment, sign in by OTP, see it, then cancel it", async ({ page }) => {
    const phone = uniquePhone("+9665");

    await bookFarOutAppointment(page, phone, EN_TEST_WEEKDAY);

    // The booking wizard signs the client in as a side effect of confirming
    // (see book/actions.ts verifyAndBook) — clear that cookie so the
    // /account/login step below genuinely exercises the standalone sign-in
    // flow rather than riding on an already-set session.
    await page.context().clearCookies();

    await loginAtAccountPage(page, "en", phone);

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("My account");

    const upcoming = page.getByTestId("account-upcoming");
    await expect(upcoming.getByText("Diagnostic Skin Analysis")).toBeVisible();
    await expect(upcoming.getByRole("button", { name: "Cancel booking" })).toBeVisible();

    const past = page.getByTestId("account-past");
    await expect(past.getByText("You don't have any past bookings yet.")).toBeVisible();

    // A5: the Notifications panel renders and its channel + save round-trips.
    const notifications = page.getByTestId("notifications-panel");
    await expect(notifications).toBeVisible();
    await notifications.locator("[data-testid='notifications-channel']").selectOption("EMAIL");
    await notifications.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByTestId("notifications-saved")).toBeVisible();

    await upcoming.getByRole("button", { name: "Cancel booking" }).click();

    // Cancellation refreshes the server component tree; the booking should
    // disappear from upcoming and reappear (as Cancelled) in past.
    await expect(upcoming.getByText("You don't have any upcoming bookings.")).toBeVisible({ timeout: 10_000 });
    await expect(past.getByText("Diagnostic Skin Analysis")).toBeVisible();
    await expect(past.getByText("Cancelled")).toBeVisible();
    await expect(past.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  });

  test("en: an unauthenticated visit to /account redirects to /account/login", async ({ page }) => {
    await page.goto("/en/account");
    await expect(page).toHaveURL(/\/en\/account\/login$/);

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Sign in to your account");
  });
});

test.describe("client account area (ar spot-check)", () => {
  test("ar: an unauthenticated visit to /account redirects to /account/login, rtl, single h1", async ({ page }) => {
    await page.goto("/ar/account");
    await expect(page).toHaveURL(/\/ar\/account\/login$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
  });

  test("ar: sign in by OTP and see the account page", async ({ page }) => {
    const phone = uniquePhone("+9666");

    // Seed a booking for this phone via the (English) wizard — the wizard
    // itself is already covered end-to-end in site-booking.spec.ts, so this
    // spot-check only needs *a* booking to exist for the phone, not to
    // re-verify the wizard's own bilingual behavior.
    await bookFarOutAppointment(page, phone, AR_TEST_WEEKDAY);
    await page.context().clearCookies();

    await loginAtAccountPage(page, "ar", phone);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("حسابي");

    await expect(page.getByTestId("account-upcoming").getByText("تحليل تشخيصي للبشرة")).toBeVisible();
  });
});
