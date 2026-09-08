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

async function selectFirstOpenSlot(page: Page) {
  const dayButtons = page.locator("button[data-date]");
  await expect(dayButtons.first()).toBeVisible();
  const dateAttrs = await dayButtons.evaluateAll((els) => els.map((el) => el.getAttribute("data-date")));
  const candidateDates = dateAttrs.filter((d): d is string => !!d && isSunToThu(d));
  expect(candidateDates.length).toBeGreaterThan(0);

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
    const uniquePhone = `+9665${Date.now().toString().slice(-8)}`;
    await page.getByLabel("Full name").fill("Sarah Booking Test");
    await page.getByLabel("Phone number").fill(uniquePhone);
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
