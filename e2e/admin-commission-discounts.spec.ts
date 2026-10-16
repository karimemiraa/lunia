import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";

// docs/PRD-commission-discounts-roles.md:
//  1. a specialist discounts her own customer on the visit board (within her
//     10% cap it applies; above it waits), a manager approves it, and the
//     specialist then sees her commission on "My time & leave";
//  2. each role's menu and pages match the job (specialist / owner).

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const line = readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
  return (line ?? "").slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
const OWNER = { email: process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net", password: process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!" };
const SPECIALIST = { email: process.env.SEED_SPECIALIST_EMAIL ?? "specialist@lunia.local", password: process.env.SEED_SPECIALIST_PASSWORD ?? "ChangeMe123!" };

const created: string[] = [];

test.afterAll(async () => {
  // Close the visits we opened so their room isn't left "occupied" for other specs.
  await prisma.checkIn.updateMany({ where: { bookingId: { in: created } }, data: { stage: "DONE" } });
  await prisma.booking.updateMany({ where: { id: { in: created } }, data: { status: "COMPLETED" } });
  await prisma.$disconnect();
});

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', who.email);
  await page.fill('input[name="password"]', who.password);
  await page.getByRole("button", { name: /Sign in|تسجيل الدخول/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().addCookies([{ name: "lunia_staff_locale", value: "en", url: page.url() }]);
}

/** Her customer, in the treatment room right now, 500 SAR. */
async function inTreatment(specialistId: string) {
  const service = await prisma.service.findFirstOrThrow({ where: { isPublished: true }, orderBy: { order: "asc" } });
  const room = await prisma.room.findFirstOrThrow({ where: { isActive: true }, orderBy: { order: "asc" } });
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const user = await prisma.user.create({ data: { type: "CLIENT", email: `disc-${suffix}@e2e.lunia.local`, clientProfile: { create: { fullName: `Discount E2E ${suffix.slice(-4)}` } } }, include: { clientProfile: true } });
  const startAt = new Date(Date.now() - 10 * 60_000);
  const booking = await prisma.booking.create({
    data: {
      clientProfileId: user.clientProfile!.id,
      status: "CHECKED_IN",
      channel: "FRONT_DESK",
      appointments: { create: { serviceId: service.id, staffUserId: specialistId, roomId: room.id, startAt, endAt: new Date(startAt.getTime() + 45 * 60_000), priceMinorSnapshot: 500_00 } },
      checkIn: { create: { arrivedAt: startAt, stage: "TREATMENT", stageAt: startAt, seatedAt: startAt } },
    },
    include: { appointments: true },
  });
  created.push(booking.id);
  return { bookingId: booking.id, appointmentId: booking.appointments[0]!.id, serviceId: service.id, clientName: user.clientProfile!.fullName };
}

test("a specialist discounts her customer, a manager approves, and she sees her commission", async ({ page }) => {
  const specialist = await prisma.user.findUniqueOrThrow({ where: { email: SPECIALIST.email } });
  await prisma.employeeRecord.upsert({ where: { userId: specialist.id }, create: { userId: specialist.id, commissionBp: 1000 }, update: { commissionBp: 1000, discountCapPct: null } });
  const small = await inTreatment(specialist.id);
  const big = await inTreatment(specialist.id);
  const card = (id: string) => page.locator(`[data-testid="visit-card"][data-booking-id="${id}"]`);

  // Specialist: her own customers on the board.
  await signIn(page, SPECIALIST);
  await page.goto("/admin/visits");
  await expect(card(small.bookingId)).toBeVisible();

  // 5% — within her cap, applies at once.
  await card(small.bookingId).getByTestId("give-discount").click();
  await card(small.bookingId).getByTestId("discount-value").fill("5");
  await card(small.bookingId).getByTestId("discount-save").click();
  await expect(card(small.bookingId).getByTestId("visit-discount")).toHaveAttribute("data-discount-status", "APPLIED", { timeout: 15_000 });

  // 20% — above the cap, waits for a manager.
  await card(big.bookingId).getByTestId("give-discount").click();
  await card(big.bookingId).getByTestId("discount-value").fill("20");
  await card(big.bookingId).getByTestId("discount-save").click();
  await expect(card(big.bookingId).getByTestId("visit-discount")).toHaveAttribute("data-discount-status", "PENDING", { timeout: 15_000 });

  // Owner (manager rights) approves it from the board.
  await signIn(page, OWNER);
  await page.goto("/admin/visits?view=all");
  await card(big.bookingId).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(card(big.bookingId).getByTestId("visit-discount")).toHaveAttribute("data-discount-status", "APPLIED", { timeout: 15_000 });

  // Checkout: the invoice opens with her discount already on the line.
  await page.goto(`/admin/billing/new?booking=${small.bookingId}`);
  await expect(page).toHaveURL(/\/admin\/billing\/(?!new)[^/?]+$/);
  const invoiceId = page.url().split("/").pop()!;
  const draft = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { lines: true } });
  expect(draft.lines[0]!.discountMinor).toBeGreaterThan(0);
  expect(draft.lines[0]!.staffUserId).toBe(specialist.id);
  expect(draft.totalMinor).toBe(475_00); // 500 − 5%, VAT-inclusive

  // Paid in full → commission on the discounted amount (excl. VAT).
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", issuedAt: new Date(), number: `E2E-${Date.now()}`, payments: { create: { method: "CASH", amountMinor: draft.totalMinor } } } });

  await signIn(page, SPECIALIST);
  await page.goto("/admin/me");
  const mine = page.getByTestId("my-commission");
  await expect(mine).toBeVisible();
  await expect(mine).toContainText(small.clientName);
  await expect(page.getByTestId("my-commission-total")).not.toHaveText(/SAR 0\.00$/);
});

test("menus match the job: a specialist sees her work, not money, leads or prices", async ({ page }) => {
  await signIn(page, SPECIALIST);
  const nav = page.getByRole("navigation", { name: "Admin navigation" });
  for (const href of ["/admin/visits", "/admin/calendar", "/admin/clients", "/admin/me"]) {
    await expect(nav.locator(`a[href="${href}"]`).first()).toBeAttached();
  }
  for (const href of ["/admin/leads", "/admin/callbacks", "/admin/billing", "/admin/catalog/services", "/admin/reports", "/admin/hr", "/admin/settings", "/admin/roles"]) {
    await expect(nav.locator(`a[href="${href}"]`)).toHaveCount(0);
  }
  // And the pages themselves turn her away.
  for (const href of ["/admin/billing", "/admin/catalog/services", "/admin/reports", "/admin/commerce"]) {
    await page.goto(href);
    await expect(page).toHaveURL(/\/admin$/);
  }

  // Owner: services & prices live under Finance now, and the catalog hub still opens.
  await signIn(page, OWNER);
  await expect(nav.locator('a[href="/admin/catalog/services"]').first()).toBeAttached();
  await page.goto("/admin/catalog");
  await expect(page.getByRole("link", { name: "Services" }).first()).toBeVisible();
});
