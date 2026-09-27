import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createDraft,
  createDraftFromBooking,
  createCreditNote,
  issueInvoice,
  updateDraft,
  voidDraft,
  InsufficientStockError,
  listInvoices,
} from "@/modules/billing/invoices";
import { recordPayment } from "@/modules/billing/settlement";
import { decodeTlv } from "@/modules/billing/zatca/tlv";
import { INITIAL_PIH, invoiceHash } from "@/modules/billing/zatca/ubl";
import { invoiceToken, verifyInvoiceToken } from "@/modules/billing/token";
import { getInvoiceDocument } from "@/modules/billing/document";
import { saveTaxSettings } from "@/modules/billing/settings";
import {
  CN_PREFIX,
  INV_PREFIX,
  TAG,
  TEST_TAX,
  makeBooking,
  makeClient,
  makeProduct,
  makeService,
  setupBilling,
  teardownBilling,
  walkInDraft,
} from "./fixtures";

beforeAll(setupBilling);
afterAll(teardownBilling);

const year = new Date(Date.now() + 3 * 3_600_000).getUTCFullYear();
const seq = (n: string) => Number(n.split("-").pop());

describe("billing/invoices drafts", () => {
  it("creates a draft from a booking: service lines at the price snapshot, booking discount, customer linked", async () => {
    const client = await makeClient(`${TAG} Noura`);
    const svc = await makeService(50_000);
    const booking = await makeBooking(client.profileId, [{ id: svc.id, priceMinor: 50_000 }], 5_000);

    const draft = await createDraftFromBooking(booking.id);
    expect(draft.status).toBe("DRAFT");
    expect(draft.number.startsWith("DRAFT-")).toBe(true);
    expect(draft.clientProfileId).toBe(client.profileId);
    expect(draft.bookingId).toBe(booking.id);
    expect(draft.customerName).toBe(`${TAG} Noura`);
    expect(draft.customerPhone).toBe(client.phone);
    // 500.00 inclusive − 50.00 inclusive discount = 450.00 total.
    expect(draft.totalMinor).toBe(45_000);
    const lines = await prisma.invoiceLine.findMany({ where: { invoiceId: draft.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: "SERVICE", serviceId: svc.id, unitPriceMinor: 43_478, totalMinor: 50_000 });

    // Clicking "Checkout" again returns the same draft.
    expect((await createDraftFromBooking(booking.id)).id).toBe(draft.id);
  });

  it("edits drafts, voids only drafts", async () => {
    const draft = await createDraft(walkInDraft(11_500));
    expect(draft.totalMinor).toBe(11_500);
    expect(draft.vatMinor).toBe(1_500);
    const edited = await updateDraft(draft.id, { ...walkInDraft(23_000), invoiceDiscountMinor: 0 });
    expect(edited.totalMinor).toBe(23_000);

    const voided = await voidDraft(draft.id);
    expect(voided.status).toBe("VOID");
    await expect(voidDraft(draft.id)).rejects.toThrow(/Only draft/);

    const issued = await issueInvoice((await createDraft(walkInDraft(1_000))).id);
    await expect(voidDraft(issued.id)).rejects.toThrow(/credit note/);
    await expect(updateDraft(issued.id, walkInDraft(2_000))).rejects.toThrow(/Only draft/);
  });

  it("refuses to issue while the seller tax settings are incomplete", async () => {
    await saveTaxSettings({ ...TEST_TAX, vatNumber: "" });
    const draft = await createDraft(walkInDraft(1_000));
    await expect(issueInvoice(draft.id)).rejects.toThrow(/VAT registration number/);
    await saveTaxSettings(TEST_TAX);
    expect((await issueInvoice(draft.id)).status).toBe("ISSUED");
  });
});

describe("billing/invoices issuing", () => {
  it("assigns the number, ZATCA QR (TLV), UUID, ICV and PIH chain", async () => {
    const a = await issueInvoice((await createDraft(walkInDraft(11_500))).id);
    const b = await issueInvoice((await createDraft(walkInDraft(57_500))).id);

    expect(a.number).toMatch(new RegExp(`^${INV_PREFIX}-${year}-\\d{6}$`));
    expect(seq(b.number)).toBe(seq(a.number) + 1);
    expect(a.issuedAt).toBeInstanceOf(Date);
    expect(a.zatcaStatus).toBe("NOT_SUBMITTED");
    expect(a.zatcaUuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.zatcaCounter).toBe(a.zatcaCounter! + 1);
    expect(b.zatcaPrevHash).toBe(a.zatcaHash);

    // The hash is SHA-256 of the stored XML without its declaration.
    const body = a.zatcaXml!.replace(/^<\?xml[^>]*>\n/, "");
    expect(invoiceHash(body)).toBe(a.zatcaHash);
    expect(a.zatcaXml).toContain(`<cbc:ID>${a.number}</cbc:ID>`);

    const tlv = decodeTlv(a.zatcaQr!);
    expect(tlv.map((t) => t.tag)).toEqual([1, 2, 3, 4, 5]);
    expect(tlv[0]!.value).toBe("مركز لونيا");
    expect(tlv[1]!.value).toBe("300000000000003");
    expect(tlv[2]!.value).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(tlv[3]!.value).toBe("115.00");
    expect(tlv[4]!.value).toBe("15.00");

    // Chain start: the very first stamped document points at the initial PIH.
    const first = await prisma.invoice.findFirst({ where: { zatcaCounter: 1 } });
    if (first) expect(first.zatcaPrevHash).toBe(INITIAL_PIH);
  });

  it("numbers stay gap-free and unique under concurrent issuing", async () => {
    const drafts = await Promise.all(Array.from({ length: 8 }, () => createDraft(walkInDraft(1_150))));
    const issued = await Promise.all(drafts.map((d) => issueInvoice(d.id)));
    const nums = issued.map((i) => seq(i.number)).sort((x, y) => x - y);
    expect(new Set(nums).size).toBe(8);
    expect(nums[7]! - nums[0]!).toBe(7);
    const counters = issued.map((i) => i.zatcaCounter!).sort((x, y) => x - y);
    expect(counters[7]! - counters[0]!).toBe(7);
    // Every document's PIH is the hash of the document before it.
    for (const inv of issued) {
      const prev = await prisma.invoice.findFirst({ where: { zatcaCounter: inv.zatcaCounter! - 1 } });
      expect(inv.zatcaPrevHash).toBe(prev?.zatcaHash ?? INITIAL_PIH);
    }
  });

  it("takes product stock out on issue and blocks when stock is short unless overridden", async () => {
    const product = await makeProduct(2);
    const draft = await createDraft({
      customerName: `${TAG} Walk-in`,
      pricesIncludeVat: false,
      lines: [{ kind: "PRODUCT", productId: product.id, description: "Test Serum", qty: 3, unitPriceMinor: 10_000, vatRateBp: 1500 }],
    });
    await expect(issueInvoice(draft.id)).rejects.toBeInstanceOf(InsufficientStockError);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");

    const issued = await issueInvoice(draft.id, { allowNegativeStock: true });
    expect(issued.totalMinor).toBe(34_500);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(-1);
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { refType: "INVOICE", refId: issued.id } });
    expect(mv).toMatchObject({ qty: -3, type: "SALE", unitCostMinor: 4_000 });
  });
});

describe("billing/invoices credit notes", () => {
  it("partial then full credit: stock returned, refund recorded, original settles", async () => {
    const product = await makeProduct(10);
    const svc = await makeService(50_000);
    const draft = await createDraft({
      customerName: `${TAG} Credit`,
      pricesIncludeVat: true,
      lines: [
        { kind: "SERVICE", serviceId: svc.id, description: "Test Facial", qty: 1, unitPriceMinor: 50_000, vatRateBp: 1500 },
        { kind: "PRODUCT", productId: product.id, description: "Test Serum", qty: 2, unitPriceMinor: 11_500, vatRateBp: 1500 },
      ],
      invoiceDiscountMinor: 0,
    });
    const inv = await issueInvoice(draft.id);
    expect(inv.totalMinor).toBe(73_000);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(8);
    await recordPayment({ invoiceId: inv.id, method: "CARD", amountMinor: 73_000 });

    // Return one serum, refunded by card.
    const cn1 = await createCreditNote({
      originalInvoiceId: inv.id,
      lines: [{ sortOrder: 1, qty: 1 }],
      reason: "Returned unopened",
      refund: { method: "CARD", amountMinor: 11_500 },
    });
    expect(cn1.kind).toBe("CREDIT_NOTE");
    expect(cn1.number).toMatch(new RegExp(`^${CN_PREFIX}-${year}-\\d{6}$`));
    expect(cn1.originalInvoiceId).toBe(inv.id);
    expect(cn1.totalMinor).toBe(11_500);
    expect(cn1.status).toBe("PAID");
    expect(cn1.zatcaXml).toContain('name="0200000">381<');
    expect(cn1.zatcaXml).toContain(`<cbc:ID>${inv.number}</cbc:ID>`);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(9);
    const ret = await prisma.stockMovement.findFirstOrThrow({ where: { refType: "INVOICE", refId: cn1.id } });
    expect(ret).toMatchObject({ qty: 1, type: "RETURN" });
    const refund = await prisma.payment.findFirstOrThrow({ where: { invoiceId: cn1.id } });
    expect(refund.amountMinor).toBe(-11_500);

    // Original: total 730 − credited 115 = due 615; net paid 730 − 115 = 615 → PAID.
    const afterCn1 = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(afterCn1.status).toBe("PAID");
    expect(afterCn1.paidMinor).toBe(61_500);

    // Can't credit more serums than remain.
    await expect(
      createCreditNote({ originalInvoiceId: inv.id, lines: [{ sortOrder: 1, qty: 2 }], reason: "Too many" }),
    ).rejects.toThrow(/left to credit/);
    // Refund can't exceed what was collected.
    await expect(
      createCreditNote({ originalInvoiceId: inv.id, reason: "Everything", refund: { method: "CASH", amountMinor: 70_000 } }),
    ).rejects.toThrow(/refundable/);

    // Full credit of the rest (no refund — e.g. goodwill voucher), restock off.
    const cn2 = await createCreditNote({ originalInvoiceId: inv.id, reason: "Service complaint", restock: false });
    expect(cn2.totalMinor).toBe(61_500);
    expect(cn1.totalMinor + cn2.totalMinor).toBe(inv.totalMinor);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(9);
    await expect(createCreditNote({ originalInvoiceId: inv.id, reason: "Again" })).rejects.toThrow(/Nothing left/);

    // Credit notes join the ZATCA chain.
    expect(cn2.zatcaCounter).toBe(cn1.zatcaCounter! + 1);
    expect(cn2.zatcaPrevHash).toBe(cn1.zatcaHash);
  });

  it("credits an unpaid invoice in full, which settles it with no refund", async () => {
    const inv = await issueInvoice((await createDraft(walkInDraft(20_000))).id);
    const cn = await createCreditNote({ originalInvoiceId: inv.id, reason: "Issued in error" });
    expect(cn.totalMinor).toBe(20_000);
    expect(cn.vatMinor).toBe(inv.vatMinor);
    const orig = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(orig.status).toBe("PAID");
    expect(orig.paidMinor).toBe(0);
  });

  it("can't credit a draft", async () => {
    const draft = await createDraft(walkInDraft(1_000));
    await expect(createCreditNote({ originalInvoiceId: draft.id, reason: "Nope" })).rejects.toThrow(/Only issued/);
  });
});

describe("billing/invoices read side", () => {
  it("lists with filters and a totals row where credit notes subtract", async () => {
    const res = await listInvoices({ q: TAG });
    expect(res.rows.length).toBeGreaterThan(0);
    const issued = res.rows.filter((r) => r.status !== "DRAFT" && r.status !== "VOID");
    const expected = issued.reduce((s, r) => s + (r.kind === "CREDIT_NOTE" ? -r.totalMinor : r.totalMinor), 0);
    expect(res.totals.totalMinor).toBe(expected);
    const drafts = await listInvoices({ q: TAG, status: "DRAFT" });
    expect(drafts.rows.every((r) => r.status === "DRAFT")).toBe(true);
  });

  it("public token verifies only untampered ids, and the document renders a QR", async () => {
    const inv = await issueInvoice((await createDraft(walkInDraft(11_500))).id);
    const token = invoiceToken(inv.id);
    expect(verifyInvoiceToken(token)).toBe(inv.id);
    expect(token).toMatch(/^[a-z0-9]+_[0-9a-f]{32}$/);
    expect(verifyInvoiceToken(`${inv.id}_AAAA`)).toBeNull();
    expect(verifyInvoiceToken(token.replace(inv.id, `${inv.id}x`))).toBeNull();
    expect(verifyInvoiceToken("garbage")).toBeNull();

    const doc = await getInvoiceDocument(inv.id);
    expect(doc?.qrSvg?.startsWith("<svg")).toBe(true);
    expect(doc?.seller.vatNumber).toBe("300000000000003");
    expect(doc?.balanceMinor).toBe(11_500);
  });
});
