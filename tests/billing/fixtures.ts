// Shared fixtures for the billing integration suites. Everything created here
// is tagged (phone prefix, slugs/SKUs, test-only invoice prefixes) so cleanup
// can find it again; the real "tax" setting and payment secrets are saved
// before and restored after.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { saveTaxSettings, DEFAULT_TAX_SETTINGS } from "@/modules/billing/settings";

export const TAG = "TESTBILL";
export const INV_PREFIX = "TINV";
export const CN_PREFIX = "TCN";
const PHONE_PREFIX = "+9665TESTBILL";
const SECRET_KEYS = ["PAYMENT_PROVIDER", "PAYMENT_SECRET_KEY", "PAYMENT_WEBHOOK_SECRET"];

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

let savedTax: Prisma.JsonValue | null | undefined;
let savedSecrets: { key: string; value: string }[] = [];

export const TEST_TAX = {
  ...DEFAULT_TAX_SETTINGS,
  sellerNameAr: "مركز لونيا",
  sellerNameEn: "Lunia Center",
  vatNumber: "300000000000003",
  crNumber: "1010000000",
  buildingNo: "1234",
  street: "Prince Sultan Rd",
  district: "Al Olaya",
  city: "Riyadh",
  postalCode: "12345",
  invoicePrefix: INV_PREFIX,
  creditNotePrefix: CN_PREFIX,
  pricesIncludeVat: true,
};

export async function setupBilling(): Promise<void> {
  await cleanupBilling();
  const row = await prisma.siteSetting.findUnique({ where: { key: "tax" } });
  savedTax = row ? row.value : null;
  savedSecrets = await prisma.platformSecret.findMany({ where: { key: { in: SECRET_KEYS } }, select: { key: true, value: true } });
  await prisma.platformSecret.deleteMany({ where: { key: { in: SECRET_KEYS } } });
  await saveTaxSettings(TEST_TAX);
}

export async function teardownBilling(): Promise<void> {
  await cleanupBilling();
  if (savedTax === null) await prisma.siteSetting.deleteMany({ where: { key: "tax" } });
  else if (savedTax !== undefined) {
    await prisma.siteSetting.update({ where: { key: "tax" }, data: { value: savedTax as Prisma.InputJsonValue } });
  }
  await prisma.platformSecret.deleteMany({ where: { key: { in: SECRET_KEYS } } });
  for (const s of savedSecrets) await prisma.platformSecret.create({ data: s });
}

async function cleanupBilling(): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { number: { startsWith: `${INV_PREFIX}-` } },
        { number: { startsWith: `${CN_PREFIX}-` } },
        { customerName: { startsWith: TAG } },
        { client: { user: { phone: { startsWith: PHONE_PREFIX } } } },
      ],
    },
    select: { id: true },
  });
  const ids = invoices.map((i) => i.id);
  await prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
  await prisma.communicationLog.deleteMany({ where: { kind: "INVOICE", toPhone: { startsWith: PHONE_PREFIX } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `${TAG.toLowerCase()}-staff` } } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testbill-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testbill-" } } });
  await prisma.product.deleteMany({ where: { sku: { startsWith: TAG } } });
  await prisma.giftCard.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.cashSession.deleteMany({ where: { note: TAG } });
}

export async function makeClient(name = `${TAG} Client`) {
  const user = await prisma.user.create({
    data: { type: "CLIENT", phone: `${PHONE_PREFIX}${uid()}`, clientProfile: { create: { fullName: name } } },
    include: { clientProfile: true },
  });
  return { profileId: user.clientProfile!.id, phone: user.phone! };
}

export async function makeService(priceMinor: number) {
  const slug = `testbill-${uid()}`;
  const dept = await prisma.department.create({
    data: { slug, nameEn: "Test", nameAr: "تجربة", taglineEn: "", taglineAr: "", descEn: "", descAr: "" },
  });
  return prisma.service.create({
    data: {
      slug,
      departmentId: dept.id,
      nameEn: "Test Facial",
      nameAr: "تنظيف بشرة تجريبي",
      summaryEn: "",
      summaryAr: "",
      benefitsEn: [],
      benefitsAr: [],
      priceMinor,
    },
  });
}

export async function makeBooking(clientProfileId: string, services: { id: string; priceMinor: number }[], discountMinor = 0) {
  const staff = await prisma.user.create({ data: { type: "STAFF", email: `${TAG.toLowerCase()}-staff-${uid()}@test.local` } });
  const room = await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } });
  const start = new Date(Date.now() + 86_400_000);
  return prisma.booking.create({
    data: {
      clientProfileId,
      discountMinor,
      appointments: {
        create: services.map((s, i) => ({
          serviceId: s.id,
          staffUserId: staff.id,
          roomId: room.id,
          startAt: new Date(start.getTime() + i * 3_600_000),
          endAt: new Date(start.getTime() + (i + 1) * 3_600_000),
          priceMinorSnapshot: s.priceMinor,
        })),
      },
    },
  });
}

export async function makeProduct(stockQty: number, priceMinor = 10_000) {
  return prisma.product.create({
    data: { sku: `${TAG}-${uid()}`, nameEn: "Test Serum", nameAr: "سيروم", priceMinor, costMinor: 4_000, stockQty },
  });
}

export async function openCashSession() {
  const staff = await prisma.user.create({ data: { type: "STAFF", email: `${TAG.toLowerCase()}-staff-${uid()}@test.local` } });
  return prisma.cashSession.create({ data: { openedById: staff.id, openingFloatMinor: 50_000, note: TAG } });
}

/** A walk-in draft with one VAT-inclusive custom line. */
export function walkInDraft(totalInclMinor: number, extra: Partial<{ customerName: string }> = {}) {
  return {
    customerName: extra.customerName ?? `${TAG} Walk-in`,
    pricesIncludeVat: true,
    lines: [{ kind: "OTHER" as const, description: "Consultation", qty: 1, unitPriceMinor: totalInclMinor, discountMinor: 0, vatRateBp: 1500 }],
    invoiceDiscountMinor: 0,
  };
}
