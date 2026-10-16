import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { getTaxSettings } from "@/modules/billing/settings";
import { commissionLines, commissionOf, invoiceLineBases, packageSessionValue, summarize } from "@/modules/hr/commission";

// Specialist commission (docs/PRD-commission-discounts-roles.md §3.1):
// on collected revenue, after discounts, excl. VAT; services/products rates,
// per-service override, package sessions per use, refunds take it back.

describe("commission math", () => {
  it("rounds half away from zero, refunds negative", () => {
    expect(commissionOf(90_00, 1000)).toBe(9_00);
    expect(commissionOf(333, 250)).toBe(8);
    expect(commissionOf(-90_00, 1000)).toBe(-9_00);
  });

  it("line base is the net after line discount and invoice-discount share, excl. VAT", () => {
    const lines = [
      { kind: "SERVICE", qty: 1, unitPriceMinor: 100_00, discountMinor: 10_00, vatRateBp: 1500 },
      { kind: "PRODUCT", qty: 2, unitPriceMinor: 25_00, discountMinor: 0, vatRateBp: 1500 },
    ];
    expect(invoiceLineBases(lines, 0)).toEqual([90_00, 50_00]);
    // 14 off the 140 subtotal, split by weight: 9 + 5.
    expect(invoiceLineBases(lines, 14_00)).toEqual([81_00, 45_00]);
    // Half of the invoice settled with a package session → half counts here.
    expect(invoiceLineBases(lines, 0, 0.5)).toEqual([45_00, 25_00]);
  });

  it("package session value is price ÷ sessions, excl. VAT when prices include VAT", () => {
    expect(packageSessionValue(1150_00, 10, true, 1500)).toBe(100_00);
    expect(packageSessionValue(1000_00, 10, false, 1500)).toBe(100_00);
    expect(packageSessionValue(500_00, 0, true, 1500)).toBe(0);
  });
});

const TAG = "TESTCOMM";
let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;
const DAY = "2037-05-12";
const at = (min: number) => centerLocalToUtc(DAY, min);
const from = centerLocalToUtc("2037-05-01", 0);
const to = centerLocalToUtc("2037-05-31", 1440);

let staff = "";
let regular = "";
let laser = "";
let clientId = "";
let roomId = "";

async function invoice(opts: {
  kind?: string;
  status: "PAID" | "ISSUED";
  lines: { kind: string; serviceId?: string; unitPriceMinor: number; discountMinor?: number; staffUserId?: string | null }[];
  discountMinor?: number;
  payments?: { method: "CASH" | "PACKAGE"; amountMinor: number }[];
  originalInvoiceId?: string;
  issuedAt?: Date;
}) {
  return prisma.invoice.create({
    data: {
      number: `${TAG}-${uid()}`,
      kind: opts.kind ?? "INVOICE",
      status: opts.status,
      issuedAt: opts.issuedAt ?? at(600),
      customerName: `${TAG} Noura`,
      clientProfileId: clientId,
      discountMinor: opts.discountMinor ?? 0,
      originalInvoiceId: opts.originalInvoiceId ?? null,
      lines: {
        create: opts.lines.map((l, i) => ({
          kind: l.kind, serviceId: l.serviceId ?? null, description: `${l.kind} ${i}`, qty: 1, unitPriceMinor: l.unitPriceMinor,
          discountMinor: l.discountMinor ?? 0, vatRateBp: l.kind === "GIFT_CARD" ? 0 : 1500, sortOrder: i, staffUserId: l.staffUserId === undefined ? staff : l.staffUserId,
        })),
      },
      payments: { create: (opts.payments ?? []).map((p) => ({ ...p, receivedAt: at(620) })) },
    },
  });
}

beforeAll(async () => {
  const slug = `testcomm-${uid()}`;
  const dept = await prisma.department.create({ data: { slug, nameEn: "T", nameAr: "ت", taglineEn: "", taglineAr: "", descEn: "", descAr: "" } });
  const svc = (data: object) => prisma.service.create({ data: { departmentId: dept.id, nameAr: "جلسة", summaryEn: "", summaryAr: "", benefitsEn: [], benefitsAr: [], priceMinor: 100_00, durationMin: 45, ...data } as never });
  regular = (await svc({ slug, nameEn: "Facial" })).id;
  laser = (await svc({ slug: `${slug}-laser`, nameEn: "Laser", commissionBp: 2000 })).id;
  staff = (await prisma.user.create({
    data: {
      type: "STAFF", isActive: true, email: `${TAG.toLowerCase()}-${uid()}@test.local`,
      staffProfile: { create: { fullName: `${TAG} Lina` } },
      employeeRecord: { create: { commissionBp: 1000, productCommissionBp: 500 } },
    },
  })).id;
  clientId = (await prisma.user.create({ data: { type: "CLIENT", phone: `+9665${TAG}${uid()}`, clientProfile: { create: { fullName: `${TAG} Noura` } } }, include: { clientProfile: true } })).clientProfile!.id;
  roomId = (await prisma.room.create({ data: { name: `${TAG} room ${uid()}` } })).id;
});

afterAll(async () => {
  await prisma.invoice.deleteMany({ where: { number: { startsWith: TAG } } });
  await prisma.booking.deleteMany({ where: { clientProfileId: clientId } });
  await prisma.packagePurchase.deleteMany({ where: { clientProfileId: clientId } });
  await prisma.servicePackage.deleteMany({ where: { nameEn: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { OR: [{ email: { startsWith: TAG.toLowerCase() } }, { phone: { startsWith: `+9665${TAG}` } }] } });
  await prisma.room.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: "testcomm-" } } });
  await prisma.department.deleteMany({ where: { slug: { startsWith: "testcomm-" } } });
});

describe("commissionLines", () => {
  it("pays on collected, discounted, VAT-exclusive revenue — packages per session, refunds back", async () => {
    // Paid: facial 100 − 10 discount (10%) + product 50 (5%).
    const inv1 = await invoice({
      status: "PAID",
      lines: [{ kind: "SERVICE", serviceId: regular, unitPriceMinor: 100_00, discountMinor: 10_00 }, { kind: "PRODUCT", unitPriceMinor: 50_00 }, { kind: "GIFT_CARD", unitPriceMinor: 200_00 }],
      payments: [{ method: "CASH", amountMinor: 1_000_00 }],
    });
    // Paid: laser 200 with a 20 invoice discount, at the service's own 20%.
    await invoice({ status: "PAID", lines: [{ kind: "SERVICE", serviceId: laser, unitPriceMinor: 200_00 }], discountMinor: 20_00, payments: [{ method: "CASH", amountMinor: 207_00 }] });
    // Issued but unpaid: nothing.
    await invoice({ status: "ISSUED", lines: [{ kind: "SERVICE", serviceId: regular, unitPriceMinor: 500_00 }] });
    // Half settled by a package session: only the cash half counts here.
    await invoice({ status: "PAID", lines: [{ kind: "SERVICE", serviceId: regular, unitPriceMinor: 100_00 }], payments: [{ method: "PACKAGE", amountMinor: 57_50 }, { method: "CASH", amountMinor: 57_50 }] });
    // The session itself: a completed visit that used a package (10 sessions for 1,150).
    const pkg = await prisma.servicePackage.create({ data: { nameEn: `${TAG} 10 facials`, nameAr: "باقة", serviceId: regular, sessionsTotal: 10, priceMinor: 1_150_00 } as never });
    const purchase = await prisma.packagePurchase.create({ data: { clientProfileId: clientId, packageId: pkg.id, sessionsRemaining: 9 } });
    const visit = await prisma.booking.create({
      data: { clientProfileId: clientId, status: "COMPLETED", appointments: { create: { serviceId: regular, staffUserId: staff, roomId, startAt: at(700), endAt: at(745) } } },
    });
    await prisma.packageRedemption.create({ data: { packagePurchaseId: purchase.id, bookingId: visit.id, createdAt: at(745) } });
    // Refund of the facial on invoice 1.
    await invoice({ kind: "CREDIT_NOTE", status: "ISSUED", originalInvoiceId: inv1.id, lines: [{ kind: "SERVICE", serviceId: regular, unitPriceMinor: 90_00, staffUserId: null }] });

    const tax = await getTaxSettings();
    const pkgBase = packageSessionValue(1_150_00, 10, tax.pricesIncludeVat, tax.defaultVatRateBp);
    const lines = await commissionLines(from, to, { staffUserId: staff });
    const by = (source: string) => lines.filter((l) => l.source === source);

    expect(by("product").map((l) => [l.baseMinor, l.commissionMinor])).toEqual([[50_00, 2_50]]);
    expect(by("service").map((l) => [l.baseMinor, l.rateBp, l.commissionMinor]).sort()).toEqual(
      [[90_00, 1000, 9_00], [180_00, 2000, 36_00], [50_00, 1000, 5_00]].sort(),
    );
    expect(by("package").map((l) => [l.baseMinor, l.commissionMinor])).toEqual([[pkgBase, commissionOf(pkgBase, 1000)]]);
    expect(by("refund").map((l) => [l.baseMinor, l.commissionMinor])).toEqual([[-90_00, -9_00]]);
    expect(lines.some((l) => l.description.startsWith("GIFT_CARD"))).toBe(false);

    const s = summarize(lines).get(staff)!;
    expect(s.commissionMinor).toBe(2_50 + 9_00 + 36_00 + 5_00 + commissionOf(pkgBase, 1000) - 9_00);
    expect(s.productsBaseMinor).toBe(50_00);
  });
});
