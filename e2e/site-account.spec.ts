import { test, expect, type Page } from "@playwright/test";

// Selects a service-1 slot that starts at least `minHours` from now, trying
// each rendered day button in turn and reading each slot's real
// `data-slot-time` ISO timestamp rather than assuming anything about the
// seeded schedule or the time of day the suite happens to run at. This lets
// the account e2e test create a booking guaranteed to be well outside the
// 24h cancellation window, regardless of when/where it runs.
async function selectSlotAtLeastHoursAhead(page: Page, minHours: number): Promise<string> {
  const dayButtons = page.locator("button[data-date]");
  await expect(dayButtons.first()).toBeVisible();
  const dateAttrs = await dayButtons.evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
  const candidateDates = dateAttrs.filter((d): d is string => !!d);
  expect(candidateDates.length).toBeGreaterThan(0);

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

// Books an appointment for `phone` at least 30h out (comfortably clear of
// the 24h cancellation cutoff) via the public wizard, verifying by the
// dev-mode OTP code. Ends on the wizard's success screen.
async function bookFarOutAppointment(page: Page, phone: string) {
  await page.goto("/en/book");

  const firstService = page.locator("button[data-service-id]").first();
  await expect(firstService).toBeVisible();
  await firstService.click();

  await expect(page.getByTestId("booking-step-datetime")).toBeVisible();
  await selectSlotAtLeastHoursAhead(page, 30);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("booking-step-contact")).toBeVisible();
  await page.getByLabel("Full name").fill("Account Test Client");
  await page.getByLabel("Phone number").fill(phone);
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
  await page.getByLabel(locale === "ar" ? "رقم الجوال" : "Phone number").fill(phone);
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
    const uniquePhone = `+9665${Date.now().toString().slice(-8)}`;

    await bookFarOutAppointment(page, uniquePhone);

    // The booking wizard signs the client in as a side effect of confirming
    // (see book/actions.ts verifyAndBook) — clear that cookie so the
    // /account/login step below genuinely exercises the standalone sign-in
    // flow rather than riding on an already-set session.
    await page.context().clearCookies();

    await loginAtAccountPage(page, "en", uniquePhone);

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("My account");

    const upcoming = page.getByTestId("account-upcoming");
    await expect(upcoming.getByText("Diagnostic Skin Analysis")).toBeVisible();
    await expect(upcoming.getByRole("button", { name: "Cancel booking" })).toBeVisible();

    const past = page.getByTestId("account-past");
    await expect(past.getByText("You don't have any past bookings yet.")).toBeVisible();

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
    const uniquePhone = `+9666${Date.now().toString().slice(-8)}`;

    // Seed a booking for this phone via the (English) wizard — the wizard
    // itself is already covered end-to-end in site-booking.spec.ts, so this
    // spot-check only needs *a* booking to exist for the phone, not to
    // re-verify the wizard's own bilingual behavior.
    await bookFarOutAppointment(page, uniquePhone);
    await page.context().clearCookies();

    await loginAtAccountPage(page, "ar", uniquePhone);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("حسابي");

    await expect(page.getByTestId("account-upcoming").getByText("تحليل تشخيصي للبشرة")).toBeVisible();
  });
});
