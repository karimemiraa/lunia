import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";

// The action resolves the viewer from the session; stub that so the test
// controls the permission set and can prove the filtering is server-side.
let currentPermissions = new Set<PermissionKey>();
vi.mock("@/app/admin/_components/requireAdmin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u-test", permissions: currentPermissions })),
}));

import { paletteSearchAction } from "@/app/admin/_components/search.actions";

const TAG = `pal${Date.now().toString(36)}`;
let productId = "";
let clientId = "";

beforeAll(async () => {
  productId = (await prisma.product.create({ data: { nameEn: `Palette Cream ${TAG}` } })).id;
  const user = await prisma.user.create({
    data: { type: "CLIENT", phone: `+96650${Date.now().toString().slice(-7)}`, clientProfile: { create: { fullName: `Palette Client ${TAG}` } } },
    include: { clientProfile: true },
  });
  clientId = user.clientProfile!.id;
});

afterAll(async () => {
  await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  await prisma.clientProfile.delete({ where: { id: clientId } }).catch(() => {});
});

describe("paletteSearchAction", () => {
  it("returns nothing for short or malformed queries", async () => {
    currentPermissions = new Set([PERMISSIONS.CLIENT_VIEW]);
    const res = await paletteSearchAction("p");
    expect(Object.values(res).every((g) => g.length === 0)).toBe(true);
  });

  it("filters groups by the session user's permissions, not the caller's claim", async () => {
    currentPermissions = new Set([PERMISSIONS.CLIENT_VIEW]);
    const asReception = await paletteSearchAction(TAG);
    expect(asReception.customers.map((c) => c.id)).toContain(clientId);
    expect(asReception.products).toEqual([]);

    currentPermissions = new Set([PERMISSIONS.INVENTORY_MANAGE]);
    const asStock = await paletteSearchAction(TAG);
    expect(asStock.products.map((p) => p.id)).toContain(productId);
    expect(asStock.customers).toEqual([]);
  });
});
