// Gift card service: issuing, redeeming (spending down a balance), and
// reading gift cards. Mirrors src/modules/crm/loyalty.ts's structure --
// balance mutations run under SERIALIZABLE isolation (with the same
// retry-on-serialization-failure helper, duplicated here rather than
// imported since neither module exports it) and are backed by an
// append-only GiftCardRedemption ledger so GiftCard.balanceMinor always has
// an auditable trail behind it. Payments stay off: redeemGiftCard only
// records the intended application of a gift card toward a booking (via its
// own ledger row) -- it never charges anything and never touches
// Booking.discountMinor (that field belongs to the loyalty feature).

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { GiftCard, GiftCardRedemption, GiftCardStatus } from "@prisma/client";

// --- Serializable-transaction retry helper ---------------------------------
// Mirrors bookings.ts/loyalty.ts's runSerializableTransaction -- see those
// files for the detailed rationale. redeemGiftCard reads the current
// balance/status and then writes a capped update inside one transaction,
// exactly the read-then-write pattern that needs SERIALIZABLE + retry to
// stay race-free under concurrent redemptions of the same card.
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

// --- Code generation ---------------------------------------------------------

// Crockford-ish base32 alphabet with ambiguous characters (0/O, 1/I/L)
// dropped, so a printed/spoken code never confuses a client at the till.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const CODE_CHAR_COUNT = 16; // >= the 16+ chars required by the spec.

// Generates a random, unguessable gift-card code from crypto.randomBytes
// (never Math.random) -- 16 base32-alphabet characters is >= 80 bits of
// entropy, grouped into 4-character blocks (e.g. "AB3D-EF7H-JK2M-NP9Q") for
// readability. issueGiftCard retries on the astronomically unlikely
// @unique collision.
function generateGiftCardCode(): string {
  const bytes = randomBytes(CODE_CHAR_COUNT);
  let raw = "";
  for (let i = 0; i < CODE_CHAR_COUNT; i++) {
    raw += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return raw.match(/.{1,4}/g)!.join("-");
}

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

const MAX_CODE_ATTEMPTS = 5;

// --- Issue --------------------------------------------------------------

const issueGiftCardSchema = z.object({
  initialMinor: z.number().int().positive(),
  issuedToClientId: z.string().min(1).optional(),
  expiresAt: z.date().optional(),
  currency: z.string().min(1).default("SAR"),
});
export type IssueGiftCardInput = z.input<typeof issueGiftCardSchema>;

/**
 * Issues a new gift card: a random unguessable code, balance seeded to
 * `initialMinor`, status ACTIVE. Optionally tied to a client
 * (issuedToClientId) and/or given an expiry.
 */
export async function issueGiftCard(input: IssueGiftCardInput): Promise<GiftCard> {
  const data = issueGiftCardSchema.parse(input);

  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateGiftCardCode();
    try {
      return await prisma.giftCard.create({
        data: {
          code,
          initialMinor: data.initialMinor,
          balanceMinor: data.initialMinor,
          currency: data.currency,
          issuedToClientId: data.issuedToClientId ?? null,
          expiresAt: data.expiresAt ?? null,
          status: "ACTIVE",
        },
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err) && attempt < MAX_CODE_ATTEMPTS) continue;
      throw err;
    }
  }
  throw new Error("Failed to generate a unique gift card code");
}

// --- Redeem ------------------------------------------------------------------

export interface GiftCardRedeemResult {
  amountRedeemed: number;
  balanceMinor: number;
  status: GiftCardStatus;
}

/**
 * Redeems up to `amountMinor` from the gift card identified by `code`
 * against `bookingId` (optional -- admin/front-desk checkout may redeem
 * without one). Runs under SERIALIZABLE isolation (mirroring
 * loyalty.ts's redeemPoints) since it reads the balance/status and then
 * writes a validated decrement -- without SERIALIZABLE, two concurrent
 * redemptions of the same card could both read the same balance and jointly
 * overspend it. Rejects (throws) when the card doesn't exist, isn't ACTIVE,
 * is expired, or `amountMinor` exceeds the remaining balance -- this is a
 * strict reject (not a silent cap) since a gift-card code is user-supplied
 * at booking time and a caller needs to distinguish "amount too high" from
 * "went through". Never lets the balance go negative; flips the card to
 * REDEEMED exactly when the balance reaches zero. Writes a
 * GiftCardRedemption ledger row referencing `bookingId`.
 */
export async function redeemGiftCard(
  code: string,
  amountMinor: number,
  bookingId?: string,
): Promise<GiftCardRedeemResult> {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new Error("amountMinor must be a positive number");
  }
  const amount = Math.floor(amountMinor);
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    throw new Error("Gift card code is required");
  }

  return runSerializableTransaction(async (tx) => {
    const card = await tx.giftCard.findUnique({ where: { code: normalizedCode } });
    if (!card) {
      throw new Error("Gift card not found");
    }
    if (card.status === "VOID") {
      throw new Error("This gift card has been voided");
    }
    if (card.status === "REDEEMED") {
      throw new Error("This gift card has already been fully redeemed");
    }
    if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
      throw new Error("This gift card has expired");
    }
    if (amount > card.balanceMinor) {
      throw new Error("Amount exceeds the gift card's remaining balance");
    }

    const newBalance = card.balanceMinor - amount;
    const newStatus: GiftCardStatus = newBalance === 0 ? "REDEEMED" : "ACTIVE";

    await tx.giftCard.update({
      where: { id: card.id },
      data: { balanceMinor: newBalance, status: newStatus },
    });
    await tx.giftCardRedemption.create({
      data: { giftCardId: card.id, amountMinor: amount, bookingId: bookingId ?? null },
    });

    return { amountRedeemed: amount, balanceMinor: newBalance, status: newStatus };
  });
}

// --- Read side ---------------------------------------------------------------

export type GiftCardWithRedemptions = GiftCard & { redemptions: GiftCardRedemption[] };

export async function getGiftCard(code: string): Promise<GiftCardWithRedemptions | null> {
  return prisma.giftCard.findUnique({
    where: { code: code.trim() },
    include: { redemptions: { orderBy: { createdAt: "desc" } } },
  });
}

export interface ListGiftCardsFilter {
  status?: GiftCardStatus;
  issuedToClientId?: string;
}

export async function listGiftCards(filter: ListGiftCardsFilter = {}): Promise<GiftCardWithRedemptions[]> {
  return prisma.giftCard.findMany({
    where: {
      status: filter.status,
      issuedToClientId: filter.issuedToClientId,
    },
    include: { redemptions: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Active (non-expired) gift cards issued to a specific client -- used by the client account "My credits" panel and the booking flow. */
export async function listActiveGiftCardsForClient(clientProfileId: string): Promise<GiftCard[]> {
  return prisma.giftCard.findMany({
    where: {
      issuedToClientId: clientProfileId,
      status: "ACTIVE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
}
