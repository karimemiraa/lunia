import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { globalSearch, searchTotal, SEARCH_GROUPS } from "@/modules/search/globalSearch";
import { PERMISSIONS } from "@/modules/iam/permissions";

const TAG = `gs${Date.now().toString(36)}`;
const ids: { product?: string; invoice?: string; staff?: string } = {};

beforeAll(async () => {
  const product = await prisma.product.create({ data: { nameEn: `Search Serum ${TAG}`, sku: `SKU-${TAG}`, barcode: `629${TAG.slice(-9)}`, stockQty: 3, reorderLevel: 5 } });
  ids.product = product.id;
  const invoice = await prisma.invoice.create({ data: { number: `INV-TEST-${TAG}`, customerName: `Invoice Customer ${TAG}`, status: "ISSUED", totalMinor: 12345, issuedAt: new Date() } });
  ids.invoice = invoice.id;
  const staff = await prisma.user.create({
    data: { type: "STAFF", email: `${TAG}@staff.test`, staffProfile: { create: { fullName: `Employee ${TAG}`, title: "Therapist" } } },
  });
  ids.staff = staff.id;
});

afterAll(async () => {
  if (ids.product) await prisma.product.delete({ where: { id: ids.product } }).catch(() => {});
  if (ids.invoice) await prisma.invoice.delete({ where: { id: ids.invoice } }).catch(() => {});
  if (ids.staff) await prisma.user.delete({ where: { id: ids.staff } }).catch(() => {});
});

describe("globalSearch", () => {
  it("returns an empty result for short queries", async () => {
    const res = await globalSearch("a");
    expect(searchTotal(res)).toBe(0);
    expect(Object.keys(res).sort()).toEqual([...SEARCH_GROUPS].sort());
  });

  it("finds products by name, SKU and barcode with a low-stock badge", async () => {
    const byName = await globalSearch(`Serum ${TAG}`);
    expect(byName.products.map((p) => p.id)).toContain(ids.product);
    expect(byName.products.find((p) => p.id === ids.product)?.badge).toBe("Low stock");
    const bySku = await globalSearch(`SKU-${TAG}`);
    expect(bySku.products[0]?.href).toBe(`/admin/inventory/products/${ids.product}`);
    const byBarcode = await globalSearch(`629${TAG.slice(-9)}`);
    expect(byBarcode.products.map((p) => p.id)).toContain(ids.product);
  });

  it("finds invoices by number and customer name", async () => {
    const byNumber = await globalSearch(`INV-TEST-${TAG}`);
    expect(byNumber.invoices[0]?.href).toBe(`/admin/billing/${ids.invoice}`);
    expect(byNumber.invoices[0]?.badge).toBe("Issued");
    const byCustomer = await globalSearch(`Invoice Customer ${TAG}`);
    expect(byCustomer.invoices.map((i) => i.id)).toContain(ids.invoice);
  });

  it("finds employees by name and links to their HR file", async () => {
    const res = await globalSearch(`Employee ${TAG}`);
    expect(res.employees[0]?.href).toBe(`/admin/hr/${ids.staff}`);
    expect(res.employees[0]?.subtitle).toContain("Therapist");
  });

  it("drops every group the viewer may not see", async () => {
    const res = await globalSearch(TAG, new Set([PERMISSIONS.INVENTORY_MANAGE]));
    expect(res.products.length).toBeGreaterThan(0);
    expect(res.invoices).toEqual([]);
    expect(res.employees).toEqual([]);
    expect(res.customers).toEqual([]);
    const none = await globalSearch(TAG, new Set());
    expect(searchTotal(none)).toBe(0);
  });
});
