import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { issueGiftCard, redeemGiftCard, getGiftCard, listGiftCards, listActiveGiftCardsForClient, voidGiftCard } from "@/modules/commerce/giftcards";

// Every client created by this suite carries this phone prefix so cleanup
// can find (and remove) everything it created -- mirrors
// tests/crm/loyalty.test.ts's PHONE_PREFIX convention. Deleting the User
// cascades ClientProfile; GiftCard.issuedToClientId is onDelete: SetNull so
// gift cards created against a deleted client survive as "unassigned"
// (cleaned up separately below by code prefix isn't possible since codes
// are random, so gift cards are instead swept via their own tracking set).
const PHONE_PREFIX = "+9665TESTGIFTCARD";
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

const createdGiftCardIds: string[] = [];

async function sweep() {
  await prisma.giftCardRedemption.deleteMany({ where: { giftCardId: { in: createdGiftCardIds } } });
  await prisma.giftCard.deleteMany({ where: { id: { in: createdGiftCardIds } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
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

async function issue(input: Parameters<typeof issueGiftCard>[0]) {
  const card = await issueGiftCard(input);
  createdGiftCardIds.push(card.id);
  return card;
}

describe("giftcards/issueGiftCard", () => {
  it("generates a 16+ char unguessable code and seeds the balance to initialMinor, ACTIVE", async () => {
    const card = await issue({ initialMinor: 20_000 });
    expect(card.status).toBe("ACTIVE");
    expect(card.initialMinor).toBe(20_000);
    expect(card.balanceMinor).toBe(20_000);
    expect(card.currency).toBe("SAR");
    // Dashes are cosmetic grouping -- strip them before counting entropy chars.
    expect(card.code.replace(/-/g, "").length).toBeGreaterThanOrEqual(16);
  });

  it("generates distinct codes across calls", async () => {
    const a = await issue({ initialMinor: 1_000 });
    const b = await issue({ initialMinor: 1_000 });
    expect(a.code).not.toBe(b.code);
  });

  it("can be issued to a specific client with an expiry", async () => {
    const clientProfileId = await makeClient("Gift Recipient");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    const card = await issue({ initialMinor: 5_000, issuedToClientId: clientProfileId, expiresAt });
    expect(card.issuedToClientId).toBe(clientProfileId);
    expect(card.expiresAt?.getTime()).toBe(expiresAt.getTime());

    const active = await listActiveGiftCardsForClient(clientProfileId);
    expect(active.map((c) => c.id)).toContain(card.id);
  });
});

describe("giftcards/redeemGiftCard", () => {
  it("decrements the balance and writes a ledger row", async () => {
    const card = await issue({ initialMinor: 10_000 });
    const result = await redeemGiftCard(card.code, 3_000, "booking-1");
    expect(result.amountRedeemed).toBe(3_000);
    expect(result.balanceMinor).toBe(7_000);
    expect(result.status).toBe("ACTIVE");

    const fetched = await getGiftCard(card.code);
    expect(fetched?.balanceMinor).toBe(7_000);
    expect(fetched?.redemptions.length).toBe(1);
    expect(fetched?.redemptions[0]?.amountMinor).toBe(3_000);
    expect(fetched?.redemptions[0]?.bookingId).toBe("booking-1");
  });

  it("flips to REDEEMED exactly when the balance hits zero", async () => {
    const card = await issue({ initialMinor: 5_000 });
    const result = await redeemGiftCard(card.code, 5_000);
    expect(result.balanceMinor).toBe(0);
    expect(result.status).toBe("REDEEMED");

    const fetched = await getGiftCard(card.code);
    expect(fetched?.status).toBe("REDEEMED");
  });

  it("rejects an over-redemption (amount exceeds balance) and never lets the balance go negative", async () => {
    const card = await issue({ initialMinor: 1_000 });
    await expect(redeemGiftCard(card.code, 1_001)).rejects.toThrow();

    const fetched = await getGiftCard(card.code);
    expect(fetched?.balanceMinor).toBe(1_000);
    expect(fetched!.balanceMinor).toBeGreaterThanOrEqual(0);
  });

  it("rejects redemption of an already-REDEEMED card", async () => {
    const card = await issue({ initialMinor: 500 });
    await redeemGiftCard(card.code, 500);
    await expect(redeemGiftCard(card.code, 1)).rejects.toThrow();
  });

  it("rejects redemption of a VOID card", async () => {
    const card = await issue({ initialMinor: 500 });
    await prisma.giftCard.update({ where: { id: card.id }, data: { status: "VOID" } });
    await expect(redeemGiftCard(card.code, 100)).rejects.toThrow();

    const fetched = await getGiftCard(card.code);
    expect(fetched?.balanceMinor).toBe(500);
  });

  it("rejects redemption of an expired card", async () => {
    const card = await issue({ initialMinor: 500, expiresAt: new Date(Date.now() - 1000) });
    await expect(redeemGiftCard(card.code, 100)).rejects.toThrow();

    const fetched = await getGiftCard(card.code);
    expect(fetched?.balanceMinor).toBe(500);
    expect(fetched?.status).toBe("ACTIVE");
  });

  it("rejects an unknown code without throwing an unhandled DB error", async () => {
    await expect(redeemGiftCard("NOPE-NOPE-NOPE-NOPE", 100)).rejects.toThrow(/not found/i);
  });

  it("prevents double-spend: two concurrent redemptions against the same card never jointly overspend it", async () => {
    const card = await issue({ initialMinor: 1_000 });

    const results = await Promise.allSettled([
      redeemGiftCard(card.code, 700),
      redeemGiftCard(card.code, 700),
    ]);

    const succeeded = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof redeemGiftCard>>> => r.status === "fulfilled");
    const totalRedeemed = succeeded.reduce((sum, r) => sum + r.value.amountRedeemed, 0);
    expect(totalRedeemed).toBeLessThanOrEqual(1_000);

    const fetched = await getGiftCard(card.code);
    expect(fetched?.balanceMinor).toBe(1_000 - totalRedeemed);
    expect(fetched!.balanceMinor).toBeGreaterThanOrEqual(0);
  });
});

describe("giftcards/voidGiftCard", () => {
  it("marks an ACTIVE card VOID, blocking future redemption", async () => {
    const card = await issue({ initialMinor: 500 });
    const voided = await voidGiftCard(card.id);
    expect(voided.status).toBe("VOID");

    await expect(redeemGiftCard(card.code, 1)).rejects.toThrow();
  });

  it("refuses to void an already-REDEEMED card", async () => {
    const card = await issue({ initialMinor: 500 });
    await redeemGiftCard(card.code, 500);
    await expect(voidGiftCard(card.id)).rejects.toThrow();
  });

  it("refuses to void an already-VOID card", async () => {
    const card = await issue({ initialMinor: 500 });
    await voidGiftCard(card.id);
    await expect(voidGiftCard(card.id)).rejects.toThrow();
  });

  it("rejects an unknown gift card id", async () => {
    await expect(voidGiftCard("nonexistent-id")).rejects.toThrow(/not found/i);
  });
});

describe("giftcards/listGiftCards", () => {
  it("filters by status", async () => {
    const active = await issue({ initialMinor: 100 });
    const redeemed = await issue({ initialMinor: 100 });
    await redeemGiftCard(redeemed.code, 100);

    const activeList = await listGiftCards({ status: "ACTIVE" });
    expect(activeList.map((c) => c.id)).toContain(active.id);
    expect(activeList.map((c) => c.id)).not.toContain(redeemed.id);

    const redeemedList = await listGiftCards({ status: "REDEEMED" });
    expect(redeemedList.map((c) => c.id)).toContain(redeemed.id);
  });
});
