// Loyalty points service: earning points on completed bookings, auto
// upgrading a client's membership tier as their balance crosses tier
// thresholds, redeeming points for a booking discount, and manual admin
// adjustments. All balance mutations go through the append-only
// LoyaltyTransaction ledger so LoyaltyAccount.pointsBalance always has an
// auditable trail behind it.

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { LoyaltyTransaction, MembershipTier } from "@prisma/client";

// 1 point per 100 minor currency units spent (e.g. 1 point per 1 SAR, since
// amounts are stored in halalas). Kept as a named constant since both
// earnForBooking and any future reporting need the same conversion.
export const EARN_DIVISOR = 100;

// 1 redeemed point removes 1 minor currency unit from the booking's price.
// Kept deliberately simple/consistent with EARN_DIVISOR's "1 point ~= 1
// halala of spend" framing -- a future revision could decouple these.
export const REDEEM_VALUE_MINOR_PER_POINT = 1;

const EARN_REASON = "EARN";
const REDEEM_REASON = "REDEEM";
const ADJUST_REASON = "ADJUST";
const TIER_REASON = "TIER";

// Some seeded tiers (bride/postsurgery -- see prisma/seed.ts) are
// staff-assigned program tiers, not loyalty ranks, and are deliberately
// given an unreachable minPoints (~1e9) so points alone never auto-assigns
// them. getLoyalty's "next tier" progress display should never surface one
// of those as "your next tier" (which would show a nonsensical multi-million
// point gap) -- this ceiling excludes them from that specific computation
// while leaving applyAutoTier's tier selection untouched (a balance that
// high never occurs in practice, so it's a no-op there).
const LOYALTY_LADDER_CEILING = 1_000_000;

// --- Serializable-transaction retry helper ---------------------------------
// Mirrors src/modules/booking/bookings.ts's runSerializableTransaction (see
// that file for the detailed rationale): redeemPoints/adjustPoints read the
// current balance and then write a capped/validated update inside one
// transaction, which is exactly the read-then-write pattern that needs
// SERIALIZABLE + retry to stay race-free under concurrent calls for the same
// client. Duplicated here (rather than imported) since bookings.ts doesn't
// export it and the two modules should stay independently testable.
const SERIALIZATION_FAILURE_CODE = "P2034";
const POSTGRES_SERIALIZATION_FAILURE = "40001";
const POSTGRES_DEADLOCK_DETECTED = "40P01";
const MAX_SERIALIZABLE_ATTEMPTS = 5;

function isSerializationFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === SERIALIZATION_FAILURE_CODE) {
    return true;
  }
  if (!(err instanceof Error)) return false;
  if (err.message.includes("could not serialize") || err.message.includes("deadlock detected")) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const c = cause as Record<string, unknown>;
    if (c.originalCode === POSTGRES_SERIALIZATION_FAILURE || c.originalCode === POSTGRES_DEADLOCK_DETECTED) {
      return true;
    }
    if (c.kind === "TransactionWriteConflict") return true;
    if (
      typeof c.originalMessage === "string" &&
      (c.originalMessage.includes("could not serialize") || c.originalMessage.includes("deadlock detected"))
    ) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSerializableTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      if (!isSerializationFailure(err)) {
        throw err;
      }
      lastError = err;
      if (attempt < MAX_SERIALIZABLE_ATTEMPTS) {
        const backoffMs = 10 * 2 ** (attempt - 1) + Math.floor(Math.random() * 10);
        await sleep(backoffMs);
      }
    }
  }
  throw lastError;
}

// Unique-constraint check for earnForBooking's idempotency backstop (the
// LoyaltyTransaction @@unique([bookingId, reason]) constraint). The primary
// idempotency path is a plain existence check before inserting; this only
// guards the race where two concurrent calls both pass that check.
const UNIQUE_CONSTRAINT_CODE = "P2002";
const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueConstraintViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_CONSTRAINT_CODE) {
    return true;
  }
  if (!(err instanceof Error)) return false;
  if (err.message.includes("Unique constraint")) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const c = cause as Record<string, unknown>;
    if (c.originalCode === POSTGRES_UNIQUE_VIOLATION) return true;
    if (c.kind === "UniqueConstraintViolation") return true;
    if (typeof c.originalMessage === "string" && c.originalMessage.includes("duplicate key value")) return true;
  }
  return false;
}

// --- Earn -------------------------------------------------------------------

/**
 * Awards loyalty points for a completed booking: floor(netMinor /
 * EARN_DIVISOR), where netMinor is the booking's total appointment price
 * minus any discount already applied (redeemed points don't themselves earn
 * more points). Idempotent per booking via the (bookingId, reason="EARN")
 * unique constraint -- calling this twice for the same booking only ever
 * awards points once; the second call returns 0. Returns the number of
 * points actually awarded (0 if none, e.g. a free/fully-discounted booking,
 * or already earned).
 */
export async function earnForBooking(bookingId: string): Promise<number> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { appointments: true },
  });
  if (!booking) {
    throw new Error(`Booking "${bookingId}" not found`);
  }

  const grossMinor = booking.appointments.reduce((sum, a) => sum + a.priceMinorSnapshot, 0);
  const netMinor = Math.max(0, grossMinor - booking.discountMinor);
  const points = Math.floor(netMinor / EARN_DIVISOR);
  if (points <= 0) return 0;

  const existing = await prisma.loyaltyTransaction.findUnique({
    where: { bookingId_reason: { bookingId, reason: EARN_REASON } },
  });
  if (existing) return 0;

  try {
    await prisma.$transaction([
      prisma.loyaltyTransaction.create({
        data: { clientProfileId: booking.clientProfileId, deltaPoints: points, reason: EARN_REASON, bookingId },
      }),
      prisma.loyaltyAccount.upsert({
        where: { clientProfileId: booking.clientProfileId },
        create: { clientProfileId: booking.clientProfileId, pointsBalance: points },
        update: { pointsBalance: { increment: points } },
      }),
    ]);
  } catch (err) {
    // Lost a race against a concurrent earnForBooking call for the same
    // booking -- it already recorded the EARN row, so this call awards
    // nothing further.
    if (isUniqueConstraintViolation(err)) return 0;
    throw err;
  }

  return points;
}

// --- Auto-tier ---------------------------------------------------------------

/**
 * Sets a client's membership to the highest MembershipTier whose minPoints
 * is <= their current points balance (ties broken by priority, highest
 * first), if that differs from their current tier. A no-op when the client
 * already has no LoyaltyAccount (balance 0) and is already on/below the
 * lowest tier, or when the computed tier matches their current one.
 *
 * NOTE (documented per design): this always *sets* the computed tier -- it
 * does not check whether the client's current tier was manually assigned by
 * staff to something the points balance wouldn't itself justify (e.g. a
 * "VIP" granted for other reasons). Keeping this simple per the engagement
 * spec; a future revision could special-case that "never downgrade a
 * staff-assigned tier" scenario if it turns out to matter in practice.
 */
export async function applyAutoTier(clientProfileId: string): Promise<void> {
  const account = await prisma.loyaltyAccount.findUnique({ where: { clientProfileId } });
  const balance = account?.pointsBalance ?? 0;

  const [targetTier] = await prisma.membershipTier.findMany({
    where: { minPoints: { lte: balance } },
    orderBy: [{ minPoints: "desc" }, { priority: "desc" }],
    take: 1,
  });
  if (!targetTier) return; // No tier qualifies (shouldn't happen once "guest" @ minPoints=0 is seeded).

  const currentMembership = await prisma.clientMembership.findUnique({ where: { clientId: clientProfileId } });
  if (currentMembership?.tierId === targetTier.id) return; // Already on the right tier -- nothing to do.

  await prisma.clientMembership.upsert({
    where: { clientId: clientProfileId },
    create: { clientId: clientProfileId, tierId: targetTier.id },
    update: { tierId: targetTier.id },
  });

  // Points-neutral note in the ledger so the tier change is visible in the
  // client's loyalty history alongside their earn/redeem activity.
  await prisma.loyaltyTransaction.create({
    data: { clientProfileId, deltaPoints: 0, reason: TIER_REASON, bookingId: null },
  });
}

// --- Redeem ------------------------------------------------------------------

export interface RedeemResult {
  pointsRedeemed: number;
  discountMinor: number;
}

/**
 * Redeems up to `points` loyalty points as a discount on `bookingId`, capped
 * at (a) the client's current balance and (b) the booking's own price (minus
 * any discount already applied), so a booking can never go into negative
 * price and a client can never spend points they don't have. Runs under
 * SERIALIZABLE isolation (mirroring bookings.ts's createBooking) since it
 * reads the balance and then writes a capped update -- without
 * SERIALIZABLE, two concurrent redemptions for the same client could both
 * read the same balance and jointly overspend it. Writes a negative
 * LoyaltyTransaction (reason="REDEEM") and sets Booking.discountMinor.
 * Never lets the balance go negative. Returns { pointsRedeemed: 0,
 * discountMinor: 0 } (a no-op) if `points` is not positive or nothing can be
 * redeemed (zero balance, or the booking is already fully discounted).
 */
export async function redeemPoints(clientProfileId: string, points: number, bookingId: string): Promise<RedeemResult> {
  if (!Number.isFinite(points) || points <= 0) {
    return { pointsRedeemed: 0, discountMinor: 0 };
  }
  const requestedPoints = Math.floor(points);

  return runSerializableTransaction(async (tx) => {
    const [account, booking] = await Promise.all([
      tx.loyaltyAccount.findUnique({ where: { clientProfileId } }),
      tx.booking.findUnique({ where: { id: bookingId }, include: { appointments: true } }),
    ]);
    if (!booking || booking.clientProfileId !== clientProfileId) {
      throw new Error(`Booking "${bookingId}" not found for client "${clientProfileId}"`);
    }

    const balance = account?.pointsBalance ?? 0;
    const grossMinor = booking.appointments.reduce((sum, a) => sum + a.priceMinorSnapshot, 0);
    const remainingPriceMinor = Math.max(0, grossMinor - booking.discountMinor);
    const maxPointsByPrice = Math.floor(remainingPriceMinor / REDEEM_VALUE_MINOR_PER_POINT);

    const cappedPoints = Math.max(0, Math.min(requestedPoints, balance, maxPointsByPrice));
    if (cappedPoints <= 0) {
      return { pointsRedeemed: 0, discountMinor: 0 };
    }
    const discountMinor = cappedPoints * REDEEM_VALUE_MINOR_PER_POINT;

    await tx.loyaltyAccount.update({
      where: { clientProfileId },
      data: { pointsBalance: { decrement: cappedPoints } },
    });
    await tx.loyaltyTransaction.create({
      data: { clientProfileId, deltaPoints: -cappedPoints, reason: REDEEM_REASON, bookingId },
    });
    await tx.booking.update({
      where: { id: bookingId },
      data: { discountMinor: booking.discountMinor + discountMinor },
    });

    return { pointsRedeemed: cappedPoints, discountMinor };
  });
}

// --- Manual adjustment (admin) ------------------------------------------------

/**
 * Applies a manual points adjustment (positive or negative) for admin use --
 * e.g. a goodwill credit or a correction. Runs under SERIALIZABLE (same
 * read-then-write race as redeemPoints) and refuses an adjustment that would
 * push the balance negative. Writes a LoyaltyTransaction with the given
 * `reason` and returns the resulting balance.
 */
export async function adjustPoints(clientProfileId: string, deltaPoints: number, reason: string = ADJUST_REASON): Promise<number> {
  if (!Number.isFinite(deltaPoints) || deltaPoints === 0) {
    throw new Error("deltaPoints must be a non-zero finite number");
  }
  const delta = Math.trunc(deltaPoints);

  return runSerializableTransaction(async (tx) => {
    const account = await tx.loyaltyAccount.findUnique({ where: { clientProfileId } });
    const currentBalance = account?.pointsBalance ?? 0;
    const newBalance = currentBalance + delta;
    if (newBalance < 0) {
      throw new Error("Adjustment would make the points balance negative");
    }

    await tx.loyaltyAccount.upsert({
      where: { clientProfileId },
      create: { clientProfileId, pointsBalance: newBalance },
      update: { pointsBalance: newBalance },
    });
    await tx.loyaltyTransaction.create({
      data: { clientProfileId, deltaPoints: delta, reason, bookingId: null },
    });

    return newBalance;
  });
}

// --- Read side ---------------------------------------------------------------

export interface LoyaltyTierInfo {
  id: string;
  key: string;
  name: string;
  minPoints: number;
}

export interface LoyaltySummary {
  balance: number;
  transactions: LoyaltyTransaction[];
  currentTier: LoyaltyTierInfo | null;
  nextTier: LoyaltyTierInfo | null;
  pointsToNextTier: number | null;
}

function toTierInfo(tier: MembershipTier): LoyaltyTierInfo {
  return { id: tier.id, key: tier.key, name: tier.name, minPoints: tier.minPoints };
}

/**
 * A client's loyalty snapshot: current balance, recent transactions (newest
 * first), their current membership tier, and the next tier up (by
 * minPoints) plus how many more points they need to reach it. `nextTier`/
 * `pointsToNextTier` are null once the client is already on the
 * highest-threshold tier.
 */
export async function getLoyalty(clientProfileId: string, options: { transactionLimit?: number } = {}): Promise<LoyaltySummary> {
  const limit = Math.min(Math.max(options.transactionLimit ?? 20, 1), 200);

  const [account, transactions, membership, tiers] = await Promise.all([
    prisma.loyaltyAccount.findUnique({ where: { clientProfileId } }),
    prisma.loyaltyTransaction.findMany({
      where: { clientProfileId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.clientMembership.findUnique({ where: { clientId: clientProfileId }, include: { tier: true } }),
    prisma.membershipTier.findMany({ orderBy: { minPoints: "asc" } }),
  ]);

  const balance = account?.pointsBalance ?? 0;
  const currentTier = membership?.tier ?? null;
  const nextTier =
    tiers.find((tier) => tier.minPoints > balance && tier.minPoints <= LOYALTY_LADDER_CEILING) ?? null;

  return {
    balance,
    transactions,
    currentTier: currentTier ? toTierInfo(currentTier) : null,
    nextTier: nextTier ? toTierInfo(nextTier) : null,
    pointsToNextTier: nextTier ? Math.max(0, nextTier.minPoints - balance) : null,
  };
}
