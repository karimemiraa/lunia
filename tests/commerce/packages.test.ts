import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createPackage,
  listPackages,
  purchasePackage,
  consumePackageSession,
  listActivePackagePurchasesForClient,
  listClientCredits,
} from "@/modules/commerce/packages";

// Mirrors tests/crm/loyalty.test.ts's PHONE_PREFIX convention. Deleting the
// User cascades ClientProfile -> PackagePurchase -> PackageRedemption.
const PHONE_PREFIX = "+9665TESTPACKAGE";
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

const createdPackageIds: string[] = [];

async function sweep() {
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  await prisma.servicePackage.deleteMany({ where: { id: { in: createdPackageIds } } });
}

beforeAll(async () => {
  await sweep();
});

afterAll(async () => {
  await sweep();
});

async function makeClient(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: { type: "CLIENT", phone: freshPhone(), clientProfile: { create: { fullName: name } } },
    include: { clientProfile: true },
  });
  return user.clientProfile!.id;
}

async function makePackage(sessionsTotal: number, options: { isActive?: boolean } = {}) {
  const pkg = await createPackage({
    nameEn: "Test Package",
    nameAr: "باقة اختبار",
    sessionsTotal,
    priceMinor: 50_000,
    isActive: options.isActive ?? true,
  });
  createdPackageIds.push(pkg.id);
  return pkg;
}

describe("packages/createPackage + listPackages", () => {
  it("creates a package and lists it", async () => {
    const pkg = await makePackage(10);
    expect(pkg.sessionsTotal).toBe(10);
    expect(pkg.isActive).toBe(true);

    const all = await listPackages();
    expect(all.map((p) => p.id)).toContain(pkg.id);
  });

  it("filters by isActive", async () => {
    const inactive = await makePackage(5, { isActive: false });
    const activeOnly = await listPackages({ isActive: true });
    expect(activeOnly.map((p) => p.id)).not.toContain(inactive.id);
  });
});

describe("packages/purchasePackage", () => {
  it("sets sessionsRemaining = sessionsTotal and status ACTIVE", async () => {
    const clientProfileId = await makeClient("Purchase Client");
    const pkg = await makePackage(8);

    const purchase = await purchasePackage(clientProfileId, pkg.id);
    expect(purchase.sessionsRemaining).toBe(8);
    expect(purchase.status).toBe("ACTIVE");
    expect(purchase.clientProfileId).toBe(clientProfileId);
  });

  it("rejects purchasing an inactive package", async () => {
    const clientProfileId = await makeClient("Inactive Purchase Client");
    const pkg = await makePackage(4, { isActive: false });
    await expect(purchasePackage(clientProfileId, pkg.id)).rejects.toThrow();
  });

  it("rejects purchasing an unknown package", async () => {
    const clientProfileId = await makeClient("Unknown Purchase Client");
    await expect(purchasePackage(clientProfileId, "nonexistent-id")).rejects.toThrow(/not found/i);
  });
});

describe("packages/consumePackageSession", () => {
  it("decrements sessionsRemaining and writes a ledger row", async () => {
    const clientProfileId = await makeClient("Consume Client");
    const pkg = await makePackage(3);
    const purchase = await purchasePackage(clientProfileId, pkg.id);

    const result = await consumePackageSession(purchase.id, "booking-abc");
    expect(result.sessionsRemaining).toBe(2);
    expect(result.status).toBe("ACTIVE");

    const redemptions = await prisma.packageRedemption.findMany({ where: { packagePurchaseId: purchase.id } });
    expect(redemptions.length).toBe(1);
    expect(redemptions[0]?.bookingId).toBe("booking-abc");
  });

  it("flips to EXHAUSTED exactly when sessionsRemaining hits zero", async () => {
    const clientProfileId = await makeClient("Exhaust Client");
    const pkg = await makePackage(1);
    const purchase = await purchasePackage(clientProfileId, pkg.id);

    const result = await consumePackageSession(purchase.id);
    expect(result.sessionsRemaining).toBe(0);
    expect(result.status).toBe("EXHAUSTED");

    const fetched = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(fetched.status).toBe("EXHAUSTED");
  });

  it("rejects consuming from an EXHAUSTED purchase and never goes below zero", async () => {
    const clientProfileId = await makeClient("Over Consume Client");
    const pkg = await makePackage(1);
    const purchase = await purchasePackage(clientProfileId, pkg.id);
    await consumePackageSession(purchase.id);

    await expect(consumePackageSession(purchase.id)).rejects.toThrow();

    const fetched = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(fetched.sessionsRemaining).toBe(0);
    expect(fetched.sessionsRemaining).toBeGreaterThanOrEqual(0);
  });

  it("rejects consuming from an unknown purchase", async () => {
    await expect(consumePackageSession("nonexistent-id")).rejects.toThrow(/not found/i);
  });

  it("is concurrency-safe: two concurrent consumes against a 1-session purchase never both succeed", async () => {
    const clientProfileId = await makeClient("Concurrent Consume Client");
    const pkg = await makePackage(1);
    const purchase = await purchasePackage(clientProfileId, pkg.id);

    const results = await Promise.allSettled([consumePackageSession(purchase.id), consumePackageSession(purchase.id)]);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded.length).toBe(1);

    const fetched = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(fetched.sessionsRemaining).toBe(0);
    expect(fetched.status).toBe("EXHAUSTED");
  });

  it("prevents double-spend on a multi-session purchase under concurrent consumption", async () => {
    const clientProfileId = await makeClient("Concurrent Multi Consume Client");
    const pkg = await makePackage(5);
    const purchase = await purchasePackage(clientProfileId, pkg.id);

    const attempts = Array.from({ length: 8 }, () => consumePackageSession(purchase.id));
    const results = await Promise.allSettled(attempts);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded.length).toBe(5);

    const fetched = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(fetched.sessionsRemaining).toBe(0);
    expect(fetched.status).toBe("EXHAUSTED");
  });
});

describe("packages/listClientCredits", () => {
  it("reports active package purchases with sessions remaining", async () => {
    const clientProfileId = await makeClient("Credits Client");
    const pkg = await makePackage(6);
    await purchasePackage(clientProfileId, pkg.id);

    const credits = await listClientCredits(clientProfileId);
    expect(credits.packages.length).toBe(1);
    expect(credits.packages[0]?.sessionsRemaining).toBe(6);
    expect(credits.packages[0]?.sessionsTotal).toBe(6);
  });

  it("excludes exhausted purchases from listActivePackagePurchasesForClient", async () => {
    const clientProfileId = await makeClient("Exhausted Credits Client");
    const pkg = await makePackage(1);
    const purchase = await purchasePackage(clientProfileId, pkg.id);
    await consumePackageSession(purchase.id);

    const active = await listActivePackagePurchasesForClient(clientProfileId);
    expect(active.map((p) => p.id)).not.toContain(purchase.id);
  });
});
