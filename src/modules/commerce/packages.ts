// Prepaid session-package service: creating packages (the sellable
// product), purchasing one for a client (payments off -- purchasePackage
// only records that a client now holds N prepaid sessions; the actual sale
// happens off-system, e.g. cash at the front desk), and consuming a session
// at booking time. Mirrors giftcards.ts/loyalty.ts's structure: balance
// (here, sessionsRemaining) mutations run under SERIALIZABLE isolation with
// the same retry-on-serialization-failure helper, backed by an append-only
// PackageRedemption ledger.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { ServicePackage, PackagePurchase, PackageRedemption, PackagePurchaseStatus } from "@prisma/client";

// --- Serializable-transaction retry helper ---------------------------------
// Duplicated from giftcards.ts/loyalty.ts/bookings.ts (see those files for
// the detailed rationale) rather than imported, so this module stays
// independently testable.
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

// --- Packages (the sellable product) ----------------------------------------

const createPackageSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  serviceId: z.string().min(1).optional(),
  sessionsTotal: z.number().int().positive(),
  priceMinor: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
});
export type CreatePackageInput = z.input<typeof createPackageSchema>;

export async function createPackage(input: CreatePackageInput): Promise<ServicePackage> {
  const data = createPackageSchema.parse(input);
  return prisma.servicePackage.create({
    data: {
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      serviceId: data.serviceId ?? null,
      sessionsTotal: data.sessionsTotal,
      priceMinor: data.priceMinor,
      isActive: data.isActive,
    },
  });
}

export interface ListPackagesFilter {
  isActive?: boolean;
}

export async function listPackages(filter: ListPackagesFilter = {}): Promise<ServicePackage[]> {
  return prisma.servicePackage.findMany({
    where: { isActive: filter.isActive },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPackage(packageId: string): Promise<ServicePackage | null> {
  return prisma.servicePackage.findUnique({ where: { id: packageId } });
}

// --- Purchase ----------------------------------------------------------------

/**
 * Records that `clientProfileId` has purchased `packageId`: creates a
 * PackagePurchase with sessionsRemaining = the package's sessionsTotal,
 * status ACTIVE. Payments are off -- this doesn't charge anything, it only
 * records the prepaid-sessions balance a client now holds (e.g. after
 * paying cash at the front desk).
 */
export async function purchasePackage(clientProfileId: string, packageId: string): Promise<PackagePurchase> {
  const servicePackage = await prisma.servicePackage.findUnique({ where: { id: packageId } });
  if (!servicePackage) {
    throw new Error(`Package "${packageId}" not found`);
  }
  if (!servicePackage.isActive) {
    throw new Error("This package is no longer available for purchase");
  }

  return prisma.packagePurchase.create({
    data: {
      clientProfileId,
      packageId,
      sessionsRemaining: servicePackage.sessionsTotal,
      status: "ACTIVE",
    },
  });
}

// --- Consume -----------------------------------------------------------------

export interface ConsumeSessionResult {
  sessionsRemaining: number;
  status: PackagePurchaseStatus;
}

/**
 * Consumes one session from `packagePurchaseId` against `bookingId`
 * (optional). Runs under SERIALIZABLE isolation (mirroring
 * redeemGiftCard/redeemPoints) since it reads sessionsRemaining/status and
 * then writes a validated decrement -- without SERIALIZABLE, two concurrent
 * consumptions of the same purchase could both read the same count and
 * jointly overspend it. Rejects (throws) when the purchase doesn't exist,
 * isn't ACTIVE, or has no sessions remaining. Never lets sessionsRemaining
 * go below zero; flips to EXHAUSTED exactly when it reaches zero. Writes a
 * PackageRedemption ledger row referencing `bookingId`.
 */
export async function consumePackageSession(
  packagePurchaseId: string,
  bookingId?: string,
): Promise<ConsumeSessionResult> {
  return runSerializableTransaction(async (tx) => {
    const purchase = await tx.packagePurchase.findUnique({ where: { id: packagePurchaseId } });
    if (!purchase) {
      throw new Error("Package purchase not found");
    }
    if (purchase.status !== "ACTIVE") {
      throw new Error(`Cannot consume a session from a package purchase with status "${purchase.status}"`);
    }
    if (purchase.sessionsRemaining <= 0) {
      throw new Error("No sessions remaining on this package");
    }

    const newRemaining = purchase.sessionsRemaining - 1;
    const newStatus: PackagePurchaseStatus = newRemaining === 0 ? "EXHAUSTED" : "ACTIVE";

    await tx.packagePurchase.update({
      where: { id: purchase.id },
      data: { sessionsRemaining: newRemaining, status: newStatus },
    });
    await tx.packageRedemption.create({
      data: { packagePurchaseId: purchase.id, bookingId: bookingId ?? null },
    });

    return { sessionsRemaining: newRemaining, status: newStatus };
  });
}

// --- Read side ---------------------------------------------------------------

export type PackagePurchaseWithPackage = PackagePurchase & { package: ServicePackage };

/** A client's active (sessionsRemaining > 0, status ACTIVE) package purchases -- used by the client account "My credits" panel and the booking flow. */
export async function listActivePackagePurchasesForClient(clientProfileId: string): Promise<PackagePurchaseWithPackage[]> {
  return prisma.packagePurchase.findMany({
    where: { clientProfileId, status: "ACTIVE", sessionsRemaining: { gt: 0 } },
    include: { package: true },
    orderBy: { createdAt: "desc" },
  });
}

export interface ClientCreditsSummary {
  giftCards: { id: string; code: string; balanceMinor: number; currency: string; expiresAt: Date | null }[];
  packages: { id: string; packageNameEn: string; packageNameAr: string; sessionsRemaining: number; sessionsTotal: number }[];
}

/**
 * A client's full "credits" snapshot: active gift cards issued to them plus
 * active package purchases with sessions remaining. Backs the client
 * account "My credits" panel. Gift-card lookup lives here (rather than
 * giftcards.ts) only to keep this single combined read colocated with its
 * one call site -- it still goes through giftcards.ts's own read helper for
 * consistency.
 */
export async function listClientCredits(clientProfileId: string): Promise<ClientCreditsSummary> {
  const [giftCards, purchases] = await Promise.all([
    prisma.giftCard.findMany({
      where: {
        issuedToClientId: clientProfileId,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    }),
    listActivePackagePurchasesForClient(clientProfileId),
  ]);

  return {
    giftCards: giftCards.map((card) => ({
      id: card.id,
      code: card.code,
      balanceMinor: card.balanceMinor,
      currency: card.currency,
      expiresAt: card.expiresAt,
    })),
    packages: purchases.map((purchase) => ({
      id: purchase.id,
      packageNameEn: purchase.package.nameEn,
      packageNameAr: purchase.package.nameAr,
      sessionsRemaining: purchase.sessionsRemaining,
      sessionsTotal: purchase.package.sessionsTotal,
    })),
  };
}
