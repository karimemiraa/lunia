import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";

// Visit journey (docs/PRD-visit-journey.md): one customer walks the whole
// board — expected → check in → waiting (timer) → received for consultation
// (first visit) → treatment room → checkout → left — in English, then the same
// visit in Arabic. The visit board only shows TODAY, and the clinic may be
// closed today (Fri/Sat), so the booking is written straight to the database
// rather than through the walk-in form's open slots.

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
  return (line ?? "").slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A brand-new customer booked a few minutes from now with the owner (first visit → consultation). */
async function bookToday(fullName: string): Promise<string> {
  const owner = await prisma.user.findFirstOrThrow({ where: { email: process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net" } });
  const service = await prisma.service.findFirstOrThrow({ where: { isPublished: true, payBeforeTreatment: false }, orderBy: { order: "asc" } });
  const room = await prisma.room.findFirstOrThrow({ where: { isActive: true }, orderBy: { order: "asc" } });
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const user = await prisma.user.create({ data: { type: "CLIENT", email: `visit-${suffix}@e2e.lunia.local` } });
  const client = await prisma.clientProfile.create({ data: { userId: user.id, fullName } });
  const startAt = new Date(Date.now() + 5 * 60_000);
  const booking = await prisma.booking.create({
    data: {
      clientProfileId: client.id,
      status: "CONFIRMED",
      channel: "FRONT_DESK",
      appointments: { create: { serviceId: service.id, staffUserId: owner.id, roomId: room.id, startAt, endAt: new Date(startAt.getTime() + service.durationMin * 60_000) } },
    },
  });
  return booking.id;
}

async function signIn(page: Page, arabic: boolean) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: /Sign in|تسجيل الدخول/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().addCookies([{ name: "lunia_staff_locale", value: arabic ? "ar" : "en", url: page.url() }]);
}

const LABELS = {
  en: { checkIn: "Check in", receive: "Receive for consultation", toRoom: "To the treatment room", finish: "Finish treatment", checkOut: "Check out", waiting: /Waiting \d+ min/, timeline: "Visit timeline", arrived: "arrived" },
  ar: { checkIn: "تسجيل الحضور", receive: "استلام للاستشارة", toRoom: "إلى غرفة العلاج", finish: "إنهاء العلاج", checkOut: "تسجيل المغادرة", waiting: /تنتظر منذ \d+ د/, timeline: "مسار الزيارة", arrived: "وصلت" },
};

for (const lang of ["en", "ar"] as const) {
  test(`walks one visit through the whole board (${lang})`, async ({ page }) => {
    const L = LABELS[lang];
    const bookingId = await bookToday(lang === "ar" ? "نورة العتيبي" : "Visit Journey E2E");
    await signIn(page, lang === "ar");

    await page.goto("/admin/visits?view=all");
    await expect(page.getByTestId("visit-board")).toBeVisible();
    const card = () => page.locator(`[data-testid="visit-card"][data-booking-id="${bookingId}"]`);
    const expectColumn = async (col: string) => expect(card()).toHaveAttribute("data-column", col, { timeout: 15_000 });

    await expectColumn("EXPECTED");
    if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // Arrive → waiting, timer running.
    await card().getByRole("button", { name: L.checkIn, exact: true }).click();
    await expectColumn("WAITING");
    await expect(card().getByTestId("visit-timer")).toHaveText(L.waiting);
    await expect(page.getByTestId("visit-column-WAITING")).toContainText(lang === "ar" ? "نورة العتيبي" : "Visit Journey E2E");

    // First visit → the specialist receives her for a consultation.
    await card().getByRole("button", { name: L.receive }).click();
    await expectColumn("CONSULTATION");

    await card().getByRole("button", { name: L.toRoom }).click();
    await expectColumn("TREATMENT");
    // The room she is in now reads as occupied.
    await expect(page.locator('[data-testid="room-chip"][data-room-state="occupied"]').first()).toBeVisible();

    await card().getByRole("button", { name: L.finish }).click();
    await expectColumn("CHECKOUT");

    await card().getByRole("button", { name: L.checkOut, exact: true }).click();
    await expectColumn("DONE");
    await expect(page.locator('[data-testid="room-chip"][data-room-state="preparing"]').first()).toBeVisible();

    // Booking is completed and the appointment page shows the full timeline.
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { appointments: true, checkIn: { include: { events: true } } } });
    expect(booking.status).toBe("COMPLETED");
    expect(booking.checkIn?.stage).toBe("DONE");
    expect(booking.checkIn?.events.map((e) => e.kind)).toEqual(["arrived", "received", "treatment_started", "treatment_finished", "checked_out"]);

    await page.goto(`/admin/calendar/${booking.appointments[0].id}`);
    const timeline = page.getByTestId("visit-timeline");
    await expect(timeline).toBeVisible();
    await expect(page.getByText(L.timeline)).toBeVisible();
    await expect(timeline).toContainText(L.arrived);
    await expect(timeline.locator("li")).toHaveCount(5);
  });
}
