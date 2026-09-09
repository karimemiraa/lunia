import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { complete } from "@/modules/booking/bookings";
import { earnForBooking, applyAutoTier, redeemPoints, adjustPoints, getLoyalty, EARN_DIVISOR } from "@/modules/crm/loyalty";

// Every phone created by this suite carries this prefix so cleanup can find
// (and remove) everything it created, regardless of which test created it or
// whether an assertion failed partway through -- mirrors
// tests/booking/bookings.test.ts's PHONE_PREFIX convention. Deleting the
// User cascades ClientProfile -> Booking/LoyaltyAccount/LoyaltyTransaction/
// ClientMembership.
const PHONE_PREFIX = "+9665TESTLOYALTY";
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

async function sweepPhonePrefixedUsers() {
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
}

beforeAll(async () => {
  await sweepPhonePrefixedUsers();
});

afterAll(async () => {
  await sweepPhonePrefixedUsers();
});

async function makeClient(name: string): Promise<string> {
  const user = await prisma.user.create({
    data: { type: "CLIENT", phone: freshPhone(), clientProfile: { create: { fullName: name } } },
    include: { clientProfile: true },
  });
  return user.clientProfile!.id;
}

// Creates a Booking + single Appointment directly (bypassing availability/
// slot logic entirely, which loyalty.ts doesn't care about) so tests can
// pin an exact priceMinorSnapshot and status.
async function makeBookingWithPrice(
  clientProfileId: string,
  priceMinorSnapshot: number,
  options: { status?: "CONFIRMED" | "COMPLETED"; discountMinor?: number } = {},
) {
  const service = await prisma.service.findFirstOrThrow();
  const staff = await prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
  const room = await prisma.room.findFirstOrThrow({ where: { isActive: true } });
  const startAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 500);
  const endAt = new Date(startAt.getTime() + 60 * 60_000);

  return prisma.booking.create({
    data: {
      clientProfileId,
      status: options.status ?? "COMPLETED",
      channel: "FRONT_DESK",
      discountMinor: options.discountMinor ?? 0,
      appointments: {
        create: {
          serviceId: service.id,
          staffUserId: staff.id,
          roomId: room.id,
          startAt,
          endAt,
          priceMinorSnapshot,
        },
      },
    },
    include: { appointments: true },
  });
}

describe("loyalty/earnForBooking", () => {
  it("awards floor(netMinor / EARN_DIVISOR) points once, and is idempotent on a second call", async () => {
    const clientProfileId = await makeClient("Earn Idempotency Client");
    const booking = await makeBookingWithPrice(clientProfileId, 25_000); // 250 SAR -> 250 pts

    const first = await earnForBooking(booking.id);
    expect(first).toBe(Math.floor(25_000 / EARN_DIVISOR));

    const second = await earnForBooking(booking.id);
    expect(second).toBe(0);

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(250);

    const earnRows = await prisma.loyaltyTransaction.findMany({
      where: { bookingId: booking.id, reason: "EARN" },
    });
    expect(earnRows.length).toBe(1);
    expect(earnRows[0]?.deltaPoints).toBe(250);
  });

  it("earns nothing (and doesn't error) for a fully-discounted booking", async () => {
    const clientProfileId = await makeClient("Zero Earn Client");
    const booking = await makeBookingWithPrice(clientProfileId, 5_000, { discountMinor: 5_000 });

    const points = await earnForBooking(booking.id);
    expect(points).toBe(0);

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account).toBeNull();
  });

  it("nets against an existing discount before flooring", async () => {
    const clientProfileId = await makeClient("Net Discount Client");
    const booking = await makeBookingWithPrice(clientProfileId, 10_000, { discountMinor: 2_500 }); // net 7500 -> 75 pts

    const points = await earnForBooking(booking.id);
    expect(points).toBe(75);
  });
});

describe("loyalty/applyAutoTier", () => {
  it("selects the highest tier whose minPoints <= balance, re-evaluating up and down as balance changes", async () => {
    const clientProfileId = await makeClient("Auto Tier Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 600 } });

    await applyAutoTier(clientProfileId);
    let membership = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId }, include: { tier: true } });
    expect(membership?.tier.key).toBe("member"); // seeded minPoints: guest=0, member=500, vip=2000

    await prisma.loyaltyAccount.update({ where: { clientProfileId }, data: { pointsBalance: 2_500 } });
    await applyAutoTier(clientProfileId);
    membership = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId }, include: { tier: true } });
    expect(membership?.tier.key).toBe("vip");

    // Documented behavior: applyAutoTier always sets the computed tier, so a
    // balance drop (e.g. after a large redemption) can move a client back
    // down too -- there's no "sticky" floor.
    await prisma.loyaltyAccount.update({ where: { clientProfileId }, data: { pointsBalance: 100 } });
    await applyAutoTier(clientProfileId);
    membership = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId }, include: { tier: true } });
    expect(membership?.tier.key).toBe("guest");
  });

  it("is a no-op when the client is already on the correct tier (no duplicate TIER ledger rows)", async () => {
    const clientProfileId = await makeClient("Stable Tier Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 50 } });

    await applyAutoTier(clientProfileId);
    await applyAutoTier(clientProfileId);

    const tierRows = await prisma.loyaltyTransaction.findMany({ where: { clientProfileId, reason: "TIER" } });
    expect(tierRows.length).toBe(1);
  });
});

describe("loyalty/redeemPoints", () => {
  it("caps redemption at the booking's price, decrements balance, and sets discountMinor", async () => {
    const clientProfileId = await makeClient("Redeem Cap Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 1_000 } });
    const booking = await makeBookingWithPrice(clientProfileId, 300, { status: "CONFIRMED" });

    const result = await redeemPoints(clientProfileId, 1_000, booking.id);
    expect(result.pointsRedeemed).toBe(300); // capped at booking price, not the requested 1000 or the 1000 balance
    expect(result.discountMinor).toBe(300);

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(700);

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.discountMinor).toBe(300);
  });

  it("caps redemption at the client's balance when it's lower than the booking price", async () => {
    const clientProfileId = await makeClient("Redeem Balance Cap Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 40 } });
    const booking = await makeBookingWithPrice(clientProfileId, 100_000, { status: "CONFIRMED" });

    const result = await redeemPoints(clientProfileId, 1_000, booking.id);
    expect(result.pointsRedeemed).toBe(40);

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(0);
  });

  it("never lets the balance go negative and redeems nothing more once a booking is fully discounted", async () => {
    const clientProfileId = await makeClient("Redeem Negative Guard Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 500 } });
    const booking = await makeBookingWithPrice(clientProfileId, 200, { status: "CONFIRMED" });

    const first = await redeemPoints(clientProfileId, 200, booking.id);
    expect(first.pointsRedeemed).toBe(200);

    // The booking is now fully discounted (price 200, discountMinor 200) --
    // a second redemption attempt on the same booking must award nothing,
    // regardless of remaining balance.
    const second = await redeemPoints(clientProfileId, 200, booking.id);
    expect(second.pointsRedeemed).toBe(0);
    expect(second.discountMinor).toBe(0);

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(300);
    expect(account!.pointsBalance).toBeGreaterThanOrEqual(0);
  });

  it("is a safe no-op for a client with no LoyaltyAccount yet (balance 0)", async () => {
    const clientProfileId = await makeClient("No Account Redeem Client");
    const booking = await makeBookingWithPrice(clientProfileId, 10_000, { status: "CONFIRMED" });

    const result = await redeemPoints(clientProfileId, 500, booking.id);
    expect(result).toEqual({ pointsRedeemed: 0, discountMinor: 0 });
  });

  it("prevents double-spend: two concurrent redemptions against the same balance never jointly overspend it", async () => {
    const clientProfileId = await makeClient("Concurrent Redeem Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 500 } });
    const bookingA = await makeBookingWithPrice(clientProfileId, 1_000_000, { status: "CONFIRMED" });
    const bookingB = await makeBookingWithPrice(clientProfileId, 1_000_000, { status: "CONFIRMED" });

    const [resultA, resultB] = await Promise.all([
      redeemPoints(clientProfileId, 400, bookingA.id),
      redeemPoints(clientProfileId, 400, bookingB.id),
    ]);

    const totalRedeemed = resultA.pointsRedeemed + resultB.pointsRedeemed;
    expect(totalRedeemed).toBeLessThanOrEqual(500);

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(500 - totalRedeemed);
    expect(account!.pointsBalance).toBeGreaterThanOrEqual(0);
  });
});

describe("loyalty/adjustPoints", () => {
  it("applies a positive manual adjustment and records the reason", async () => {
    const clientProfileId = await makeClient("Adjust Positive Client");
    const balance = await adjustPoints(clientProfileId, 150, "GOODWILL");
    expect(balance).toBe(150);

    const row = await prisma.loyaltyTransaction.findFirstOrThrow({ where: { clientProfileId, reason: "GOODWILL" } });
    expect(row.deltaPoints).toBe(150);
  });

  it("rejects an adjustment that would make the balance negative", async () => {
    const clientProfileId = await makeClient("Adjust Negative Guard Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 10 } });

    await expect(adjustPoints(clientProfileId, -50, "CORRECTION")).rejects.toThrow();

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(10);
  });
});

describe("loyalty/getLoyalty", () => {
  it("reports balance, recent transactions, current tier, and progress to the next tier", async () => {
    const clientProfileId = await makeClient("Summary Client");
    await prisma.loyaltyAccount.create({ data: { clientProfileId, pointsBalance: 600 } });
    await applyAutoTier(clientProfileId);
    await adjustPoints(clientProfileId, 10, "GOODWILL");

    const summary = await getLoyalty(clientProfileId);
    expect(summary.balance).toBe(610);
    expect(summary.currentTier?.key).toBe("member");
    expect(summary.nextTier?.key).toBe("vip");
    expect(summary.pointsToNextTier).toBe(2_000 - 610);
    expect(summary.transactions.length).toBeGreaterThan(0);
  });
});

describe("loyalty hooked into booking completion", () => {
  it("complete() awards points and applies auto-tier as a best-effort side effect", async () => {
    const clientProfileId = await makeClient("Complete Hook Client");
    const booking = await makeBookingWithPrice(clientProfileId, 50_000, { status: "CONFIRMED" }); // 500 pts -> member

    const completed = await complete(booking.id);
    expect(completed.status).toBe("COMPLETED");

    const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
    expect(account?.pointsBalance).toBe(500);

    const membership = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId }, include: { tier: true } });
    expect(membership?.tier.key).toBe("member");
  });
});
