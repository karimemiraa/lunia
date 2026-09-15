import { test, expect, type Page, type Locator } from "@playwright/test";

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

// The seeded staff schedules are only active Sun-Thu, and business hours are
// additionally closed Friday, so a walk-in must land on one of those days
// (mirrors admin-calendar.spec.ts / admin-clients.spec.ts). This spec books
// far enough out (150+ days) that it never contends with the other
// booking-flow specs' near-term slots for the same staff/room.
function isSunToThu(dateISO: string): boolean {
  const weekday = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

function toCenterDateISO(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date,
  );
}

const FAR_FUTURE_DAYS_OUT = 150;

async function pickOpenWalkInSlot(walkInForm: Locator): Promise<string> {
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

  for (let i = 0; i <= 12; i++) {
    const candidate = toCenterDateISO(new Date(Date.now() + (FAR_FUTURE_DAYS_OUT + i) * 86_400_000));
    if (!isSunToThu(candidate)) continue;
    await dateInput.fill(candidate);
    if (await slotIsAvailable()) {
      await slotButton.click();
      return candidate;
    }
  }
  throw new Error("No open walk-in slot found for the report fixture booking");
}

/** Creates a real booking via the calendar's walk-in flow (the same
 * find-or-create-client path bookings.ts uses in production) so the reports
 * pipeline has real Booking/Appointment rows to read, rather than asserting
 * on structure alone. Returns the client name and the appointment's
 * center-local date, so the report's date range can be pointed exactly at
 * it. */
async function createReportFixtureBooking(page: Page): Promise<{ name: string; dateISO: string }> {
  await page.goto("/admin/calendar");
  const walkInForm = page.getByTestId("walk-in-form");
  await expect(walkInForm).toBeVisible();

  const dateISO = await pickOpenWalkInSlot(walkInForm);

  const stamp = Date.now();
  const rand = Math.floor(100 + Math.random() * 900);
  const name = `E2E Report Client ${stamp}`;
  const phone = `+9663${stamp.toString().slice(-8)}${rand}`;

  await walkInForm.getByLabel("Customer name").fill(name);
  await walkInForm.getByLabel("Customer phone").fill(phone);
  await walkInForm.getByRole("button", { name: "Book walk-in" }).click();
  await expect(walkInForm.getByText("Booking created.")).toBeVisible({ timeout: 10_000 });

  return { name, dateISO };
}

test("report center: owner runs a bookings report and exports a matching CSV", async ({ page }) => {
  await signInAsOwner(page);

  const { name, dateISO } = await createReportFixtureBooking(page);

  await page.goto(`/admin/reports?type=bookings&from=${dateISO}&to=${dateISO}`);
  await expect(page.getByRole("heading", { name: "Report Center", exact: true, level: 1 })).toBeVisible();

  // The "Reports" nav link is present (ANALYTICS_VIEW-gated) and points here.
  await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("href", "/admin/reports");

  const table = page.getByTestId("reports-table");
  await expect(table).toBeVisible();
  await expect(table.getByText(name)).toBeVisible();

  const exportLink = page.getByTestId("export-csv-link");
  const href = await exportLink.getAttribute("href");
  expect(href).toBeTruthy();
  expect(href).toContain("type=bookings");
  expect(href).toContain(`from=${dateISO}`);

  // page.request shares the signed-in browser context's cookies, so this
  // exercises the export route as the authenticated owner.
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toContain("attachment");

  const body = await response.text();
  const [headerLine, ...dataLines] = body.split("\r\n");
  expect(headerLine).toBe("Date,Customer,Service,Staff,Status,Price (SAR)");
  expect(dataLines.some((line) => line.includes(name))).toBe(true);
});

test("report export route: a malformed from/to falls back to the default range instead of 500ing", async ({ page }) => {
  await signInAsOwner(page);

  // `from`/`to` are user-suppliable (bookmarked/crafted links): before the
  // fix these were passed straight to centerLocalToUtc -> parseDateISO,
  // which throws on anything that isn't strict "YYYY-MM-DD" and turned a
  // link like this into an unhandled 500. The route should now fall back to
  // the current month-to-date range and still return a CSV.
  const response = await page.request.get("/admin/reports/export?type=bookings&from=not-a-date&to=also-not-a-date");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toContain("attachment");

  const body = await response.text();
  expect(body.split("\r\n")[0]).toBe("Date,Customer,Service,Staff,Status,Price (SAR)");
});

test("report center page: a malformed from/to falls back to the default range instead of 500ing", async ({ page }) => {
  await signInAsOwner(page);

  const response = await page.goto("/admin/reports?type=bookings&from=not-a-date&to=also-not-a-date");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Report Center", exact: true, level: 1 })).toBeVisible();
});

test("report export route is permission-guarded: an unauthenticated request never gets CSV data", async ({ request }) => {
  // The `request` fixture is a fresh APIRequestContext with no cookies (it
  // shares nothing with the `page` fixture used by the test above), so this
  // exercises the export route as a signed-out caller.
  const response = await request.get("/admin/reports/export?type=bookings&from=2026-01-01&to=2026-12-31", {
    maxRedirects: 0,
  });

  expect([301, 302, 303, 307, 308]).toContain(response.status());
  expect(response.headers()["location"] ?? "").toContain("/admin/login");
  expect(response.headers()["content-type"] ?? "").not.toContain("text/csv");
  expect(response.headers()["content-disposition"]).toBeUndefined();
});
